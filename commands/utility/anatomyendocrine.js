// /commands/anatomyendocrine.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const axios = require('axios');
const crypto = require('crypto');

// ---- Options UI ----
const questionTypeOptions = ["MCQ", "FRQ"];
const divisionOptions = ["Division B", "Division C"];
const difficultyOptions = [
  "Very Easy (0-19%)",
  "Easy (20-39%)",
  "Medium (40-59%)",
  "Hard (60-79%)",
  "Very Hard (80-100%)"
];
const subtopicOptions = ["Hormones", "Glands", "Regulation", "Feedback", "Development"];

const difficultyMap = {
  "Very Easy (0-19%)": { min: 0.0, max: 0.19 },
  "Easy (20-39%)": { min: 0.2, max: 0.39 },
  "Medium (40-59%)": { min: 0.4, max: 0.59 },
  "Hard (60-79%)": { min: 0.6, max: 0.79 },
  "Very Hard (80-100%)": { min: 0.8, max: 1.0 }
};

// ---- Utilities ----
const prune = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const pickFirstQuestion = (arr) => Array.isArray(arr) && arr.length > 0 ? arr[0] : null;

function makeKey() {
  return crypto.randomBytes(8).toString('hex'); // 16 chars
}

// Convert API "answers" to a set of 0-based indices if possible
function toIndexSet(rawAnswers, optionCount) {
  const arr = Array.isArray(rawAnswers) ? rawAnswers : [rawAnswers];
  const idxs = new Set();

  for (let a of arr) {
    if (a == null) continue;
    // letter like "A"
    if (typeof a === 'string' && /^[A-Za-z]$/.test(a.trim())) {
      const L = a.trim().toUpperCase();
      const idx = L.charCodeAt(0) - 65;
      if (idx >= 0 && idx < optionCount) idxs.add(idx);
      continue;
    }
    // numeric (string or number) — try 0-based then 1-based
    const n = Number(String(a).trim());
    if (Number.isInteger(n)) {
      if (n >= 0 && n < optionCount) { idxs.add(n); continue; }
      if (n >= 1 && n <= optionCount) { idxs.add(n - 1); continue; }
    }
  }
  return idxs;
}

function indexToLetter(i) {
  return String.fromCharCode(65 + i); // 0->A
}

// Strictly parse user MCQ input as letters only (supports compact like "ACD")
function parseUserLettersOnly(input, optionCount) {
  const s = String(input).trim().toUpperCase();

  // Allow only letters A-Z and separators (spaces/commas). Examples: "A", "A C", "A, C", "ACD"
  if (!/^[A-Z ,]+$/.test(s)) {
    return { valid: false, letters: [] };
  }

  // Remove separators and split into individual letters
  const lettersArr = s.replace(/[ ,]+/g, '').split('');
  if (lettersArr.length === 0) {
    return { valid: false, letters: [] };
  }

  // Validate each letter against option count and de-duplicate
  const uniqLetters = new Set();
  for (const ch of lettersArr) {
    const idx = ch.charCodeAt(0) - 65; // A->0
    if (idx < 0 || idx >= optionCount) {
      return { valid: false, letters: [] };
    }
    uniqLetters.add(ch);
  }

  // Return sorted unique letters (caller does exact-set comparison)
  return { valid: true, letters: [...uniqLetters].sort() };
}

// Gemini FRQ grading truthiness
function extractIsCorrect(result) {
  if (typeof result !== 'object' || result === null) return false;
  if (typeof result.isCorrect === 'boolean') return result.isCorrect;
  if (typeof result.correct === 'boolean') return result.correct;
  if (typeof result.is_correct === 'boolean') return result.is_correct;
  if (typeof result.score === 'number') return result.score >= 0.5;
  if (typeof result.grade === 'number') return result.grade >= 0.5;
  if (typeof result.pass === 'boolean') return result.pass;
  return false;
}

// ---- One-time handlers ----
function ensureHandlers(client) {
  if (client._aeHandlersInstalled) return;
  client._aeHandlersInstalled = true;
  client._aeQuestionCache = new Map(); // key -> question
  client._aeLastAnswer = new Map();    // key -> last user answer

  client.on('interactionCreate', async (i) => {
    try {
      // Submit Answer button → show modal
      if (i.isButton() && i.customId.startsWith('ae:answer:')) {
        // customId: ae:answer:<key>:by:<userId>
        const [, , key, , ownerId] = i.customId.split(':');
        if (ownerId && i.user.id !== ownerId) {
          return i.reply({ content: "This question wasn't generated for you.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`ae:submit:${key}:by:${i.user.id}`)
          .setTitle('Submit Your Answer');

        const input = new TextInputBuilder()
          .setCustomId('answer_input')
          .setLabel('Enter letter(s) only (e.g., A, A C, or ACD)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
        return;
      }

      // Explain button → call explain endpoint (ONLY question; strip answers). Output ONLY explanation text.
      if (i.isButton() && i.customId.startsWith('ae:explain:')) {
        // customId: ae:explain:<key>:by:<userId>
        const [, , key, , ownerId] = i.customId.split(':');
        if (ownerId && i.user.id !== ownerId) {
          return i.reply({ content: "This explanation isn't for you.", ephemeral: true });
        }

        const question = i.client._aeQuestionCache.get(key);
        if (!question) {
          return i.reply({ content: 'This question has expired. Please run the command again.', ephemeral: true });
        }

        try {
          const { answers, ...questionNoAnswers } = question || {};
          const body = { question: questionNoAnswers };
          const r = await axios.post('https://scio.ly/api/gemini/explain', body, { timeout: 30000 });

          if (!r.data?.success) {
            return i.reply({ content: 'Explanation failed. Please try again in a few moments.', ephemeral: true });
          }

          let explanationText =
            (typeof r.data?.data === 'string' && r.data.data) ||
            r.data?.data?.explanation ||
            (Array.isArray(r.data?.data?.explanations) ? r.data.data.explanations[0] : null) ||
            r.data?.data?.text ||
            r.data?.message ||
            'No explanation available.';

          if (explanationText.length > 4096) explanationText = explanationText.slice(0, 4093) + '...';

          const exEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Explanation')
            .setDescription(explanationText);

          return i.reply({ embeds: [exEmbed], ephemeral: true });
        } catch (err) {
          console.error('Explain API error:', err?.message);
          return i.reply({ content: 'Explanation failed. Please try again in a few moments.', ephemeral: true });
        }
      }

      // Modal submit → grade
      if (i.isModalSubmit() && i.customId.startsWith('ae:submit:')) {
        // customId: ae:submit:<key>:by:<userId>
        const [, , key, , ownerId] = i.customId.split(':');
        if (ownerId && i.user.id !== ownerId) {
          return i.reply({ content: "This form isn't for you.", ephemeral: true });
        }

        const userAnswerRaw = i.fields.getTextInputValue('answer_input');
        const question = i.client._aeQuestionCache.get(key);
        if (!question) {
          return i.reply({ content: 'This question has expired. Please run the command again.', ephemeral: true });
        }

        i.client._aeLastAnswer.set(key, userAnswerRaw);

        let isCorrect = false;
        let shownCorrect = '';

        if (Array.isArray(question.options) && question.options.length > 0) {
          // -------- MCQ: STRICT LETTERS-ONLY GRADING (supports compact like ACD) --------
          const optionCount = question.options.length;

          // Resolve correct indices/letters from API answers
          const correctIdxSet = toIndexSet(question.answers, optionCount);
          const correctLetters = [...correctIdxSet].sort((a, b) => a - b).map(indexToLetter);

          // If we can't resolve correct letters, fail closed (won't mark correct).
          if (correctLetters.length === 0) {
            shownCorrect = Array.isArray(question.answers) ? question.answers.join(', ') : String(question.answers);
            isCorrect = false;
          } else {
            // Parse user input as letters only (includes compact like "ACD")
            const parsed = parseUserLettersOnly(userAnswerRaw, optionCount);

            // If the input isn't strictly letters-only or contains invalid tokens → incorrect
            if (!parsed.valid) {
              isCorrect = false;
            } else {
              const userLetters = [...new Set(parsed.letters)].sort();
              const correctSet = new Set(correctLetters);
              const userSet = new Set(userLetters);

              // Single-answer → exactly one letter and it must match
              if (correctLetters.length === 1) {
                isCorrect = userLetters.length === 1 && userLetters[0] === correctLetters[0];
              } else {
                // Multi-answer → exact set equality
                isCorrect =
                  userSet.size === correctSet.size &&
                  [...correctSet].every(L => userSet.has(L));
              }
            }

            shownCorrect = correctLetters.join(', ');
          }
        } else {
          // -------- FRQ: AI grading ONLY --------
          try {
            const gradeResponse = await axios.post(
              'https://scio.ly/api/gemini/grade-free-responses',
              {
                freeResponses: [{
                  question: question,
                  correctAnswers: Array.isArray(question.answers) ? question.answers : [question.answers],
                  studentAnswer: userAnswerRaw, // <-- fixed variable
                }],
              },
              { timeout: 30000 }
            );

            const ok = gradeResponse?.data?.success && Array.isArray(gradeResponse?.data?.data) && gradeResponse.data.data.length > 0;
            if (!ok) {
              return i.reply({ content: 'Grading failed. Please try again in a few moments.', ephemeral: true });
            }

            const result = gradeResponse.data.data[0];
            isCorrect = extractIsCorrect(result);
          } catch (err) {
            console.error('FRQ grading error:', err?.message);
            return i.reply({ content: 'Grading failed. Please try again in a few moments.', ephemeral: true });
          }

          const raw = Array.isArray(question.answers) ? question.answers : [question.answers];
          shownCorrect = raw.map(a => String(a)).join(', ');
        }

        const resEmbed = new EmbedBuilder()
          .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
          .setTitle(isCorrect ? '**Correct!**' : '**Incorrect**')
          .setDescription(`**Question:** ${question.question}`)
          .addFields(
            { name: '**Your Answer:**', value: String(userAnswerRaw), inline: true },
            { name: '**Accepted Answer(s):**', value: shownCorrect || '—', inline: true },
          )
          .setFooter({ text: 'Click “Explain” for a detailed explanation.' });

        return i.reply({ embeds: [resEmbed], ephemeral: true });
      }
    } catch (err) {
      console.error('anatomyendocrine handlers error:', err);
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anatomyendocrine')
    .setDescription('Get an Anatomy - Endocrine question')
    .addStringOption(option =>
      option.setName('question_type')
        .setDescription('Question type (leave blank for random)')
        .setRequired(false)
        .addChoices(...questionTypeOptions.map(q => ({ name: q, value: q.toLowerCase() }))))
    .addStringOption(option =>
      option.setName('division')
        .setDescription('Division (leave blank for random)')
        .setRequired(false)
        .addChoices(...divisionOptions.map(d => ({ name: d, value: d.split(' ')[1] }))))
    .addStringOption(option =>
      option.setName('difficulty')
        .setDescription('Difficulty (leave blank for random)')
        .setRequired(false)
        .addChoices(...difficultyOptions.map(d => ({ name: d, value: d }))))
    .addStringOption(option =>
      option.setName('subtopic')
        .setDescription('Subtopic (leave blank for random)')
        .setRequired(false)
        .addChoices(...subtopicOptions.map(s => ({ name: s, value: s })))),

  async execute(interaction) {
    try {
      ensureHandlers(interaction.client);
      await interaction.deferReply();

      const questionType = interaction.options.getString('question_type');
      const division = interaction.options.getString('division');
      const difficultyLabel = interaction.options.getString('difficulty');
      const subtopic = interaction.options.getString('subtopic');

      let difficulty_min, difficulty_max;
      if (difficultyLabel && difficultyMap[difficultyLabel]) {
        difficulty_min = difficultyMap[difficultyLabel].min;
        difficulty_max = difficultyMap[difficultyLabel].max;
      }

      const params = prune({
        event: 'Anatomy - Endocrine',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType,
        limit: 1,
      });

      const listRes = await axios.get('https://scio.ly/api/questions', { params, timeout: 15000 });
      if (!listRes.data?.success) {
        await interaction.editReply({ content: 'API error. Please try again later.' });
        return;
      }

      const question = pickFirstQuestion(listRes.data.data);
      if (!question) {
        await interaction.editReply({ content: 'No questions found matching your criteria. Try different filters.' });
        return;
      }

      const key = makeKey();
      interaction.client._aeQuestionCache.set(key, question);

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Anatomy - Endocrine')
        .setDescription(question.question ?? '—')
        .addFields(
          ...(Array.isArray(question.options) && question.options.length > 0
            ? [{
                name: '**Answer Choices:**',
                value: question.options.map((opt, i) => `**${String.fromCharCode(65 + i)})** ${opt}`).join('\n'),
                inline: false,
              }]
            : []),
          { name: '**Division:**', value: String(question.division ?? '—'), inline: true },
          { name: '**Difficulty:**', value: Number.isFinite(question.difficulty) ? `${Math.round(question.difficulty * 100)}%` : '—', inline: true },
          { name: '**Subtopic(s):**', value: (question.subtopics && question.subtopics.length) ? question.subtopics.join(', ') : 'None', inline: true },
        )
        .setFooter({ text: 'Use the buttons below.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ae:answer:${key}:by:${interaction.user.id}`)
          .setStyle(ButtonStyle.Primary)
          .setLabel('Submit Answer'),
        new ButtonBuilder()
          .setCustomId(`ae:explain:${key}:by:${interaction.user.id}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Explain'),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (err) {
      console.error('Error in Anatomy Endocrine command:', err);
      if (err.response?.status === 429) {
        await interaction.editReply({ content: 'Rate limit exceeded. Please try again in a few moments.' });
      } else {
        await interaction.editReply({ content: 'Command failed. Please try again later.' });
      }
    }
  }
};

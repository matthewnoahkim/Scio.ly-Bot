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

// Normalize text for loose comparisons
const norm = (s) => String(s ?? '')
  .trim()
  .toUpperCase()
  .replace(/[^\p{L}\p{N}.\-/% ]/gu, '') // keep letters, digits, ., -, /, %, space
  .replace(/\s+/g, ' ');

// Numeric-safe compare (handles floats like 3.14 vs "3.140")
function numericEqual(a, b, tol = 1e-6) {
  const x = Number(String(a).replace(/[^\d.\-]/g, ''));
  const y = Number(String(b).replace(/[^\d.\-]/g, ''));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
}

// MCQ helpers
function buildMcqHelpers(options = []) {
  const letters = Array.from({ length: options.length }, (_, i) => String.fromCharCode(65 + i)); // A,B,C...
  const textUpper = options.map(norm);

  const letterToIndex = Object.fromEntries(letters.map((L, i) => [L, i]));
  const textToIndex = Object.fromEntries(textUpper.map((t, i) => [t, i]));

  const tokenToIndex = (tok) => {
    if (tok == null) return null;
    const raw = String(tok).trim();
    // numeric: accept 0-based and 1-based
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      if (n >= 0 && n < options.length) return n;      // 0-based
      if (n >= 1 && n <= options.length) return n - 1; // 1-based
    }
    // letter
    const L = raw.toUpperCase()[0];
    if (letterToIndex[L] !== undefined) return letterToIndex[L];
    // text
    const txt = norm(raw);
    if (textToIndex[txt] !== undefined) return textToIndex[txt];
    return null;
  };

  const indexToLetter = (i) => letters[i] ?? '?';
  return { tokenToIndex, indexToLetter };
}

function parseUserMcqAnswer(ans, tokenToIndex) {
  const parts = String(ans).split(/[,\s]+/).filter(Boolean);
  const idxs = new Set();
  for (const p of parts) {
    const idx = tokenToIndex(p);
    if (idx !== null) idxs.add(idx);
  }
  return idxs;
}

function resolveCorrectIndices(rawAnswers, tokenToIndex, optionCount) {
  const arr = Array.isArray(rawAnswers) ? rawAnswers : [rawAnswers];

  let mapped = arr.map(a => tokenToIndex(a));
  if (mapped.every(i => i !== null && i >= 0 && i < optionCount)) return new Set(mapped);

  const numeric = arr.every(a => /^\d+$/.test(String(a).trim()));
  if (numeric) {
    mapped = arr.map(a => {
      const n = parseInt(String(a).trim(), 10);
      if (n >= 1 && n <= optionCount) return n - 1;
      if (n >= 0 && n < optionCount) return n;
      return null;
    });
    if (mapped.every(i => i !== null)) return new Set(mapped);
  }

  return new Set();
}

// FRQ: local quick check before calling grader
function localFrqCorrect(userAns, rawAnswers) {
  if (!rawAnswers || (Array.isArray(rawAnswers) && rawAnswers.length === 0)) return null;
  const userN = norm(userAns);
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [rawAnswers];

  for (const a of answers) {
    const aN = norm(a);
    if (!aN) continue;

    // Exact normalized match
    if (userN === aN) return true;

    // Numeric equality tolerance
    if (numericEqual(userAns, a)) return true;

    // Contains check (avoid false positives on very short strings)
    if (aN.length >= 4 && (userN.includes(aN) || aN.includes(userN))) return true;
  }
  return false;
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

// Extract explanation string from various shapes
function extractExplanation(payload) {
  const d = payload?.data ?? payload;
  if (typeof d === 'string') return d;
  if (typeof d?.explanation === 'string') return d.explanation;
  if (Array.isArray(d?.explanations) && typeof d.explanations[0] === 'string') return d.explanations[0];
  if (typeof d?.text === 'string') return d.text;
  if (typeof payload?.message === 'string') return payload.message;
  return '';
}

function makeKey() {
  return crypto.randomBytes(8).toString('hex'); // 16 chars
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
          .setLabel('Your answer (A/B/C/D, 1/2/3/4, or text)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
        return;
      }

      // Explain button → call explain endpoint (ONLY the question; strip answers). Output ONLY explanation.
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
          const body = { question: questionNoAnswers }; // exactly per your spec
          const r = await axios.post('https://scio.ly/api/gemini/explain', body, { timeout: 30000 });

          if (!r.data?.success) {
            return i.reply({ content: 'Explanation failed. Please try again in a few moments.', ephemeral: true });
          }

          let explanationText = extractExplanation(r.data) || 'No explanation available.';
          // Trim to embed description limit
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

        // Cache last answer (not used in explain per your spec, but kept if you change later)
        i.client._aeLastAnswer.set(key, userAnswerRaw);

        let isCorrect = false;
        let shownCorrect = '';

        if (Array.isArray(question.options) && question.options.length > 0) {
          // MCQ
          const { tokenToIndex, indexToLetter } = buildMcqHelpers(question.options);
          const correctIdxSet = resolveCorrectIndices(question.answers, tokenToIndex, question.options.length);
          const userIdxSet = parseUserMcqAnswer(userAnswerRaw, tokenToIndex);

          if (correctIdxSet.size > 0) {
            const correctSorted = [...correctIdxSet].sort((a, b) => a - b);
            const userSorted = [...userIdxSet].sort((a, b) => a - b);

            if (correctSorted.length === 1) {
              isCorrect = userSorted.length === 1 && userSorted[0] === correctSorted[0];
            } else {
              isCorrect =
                userSorted.length === correctSorted.length &&
                correctSorted.every((v, idx) => v === userSorted[idx]);
            }

            shownCorrect = correctSorted.map(indexToLetter).join(', ');
          } else {
            const raw = Array.isArray(question.answers) ? question.answers : [question.answers];
            shownCorrect = raw.map(a => String(a)).join(', ');
            isCorrect = false;
          }
        } else {
          // FRQ → local check, then API fallback
          const local = localFrqCorrect(userAnswerRaw, question.answers);
          if (local === true) {
            isCorrect = true;
          } else {
            try {
              const gradeRes = await axios.post(
                'https://scio.ly/api/gemini/grade-free-responses',
                {
                  freeResponses: [{
                    question,
                    correctAnswers: Array.isArray(question.answers) ? question.answers : [question.answers],
                    studentAnswer: userAnswerRaw,
                  }],
                },
                { timeout: 30000 }
              );
              const arr = gradeRes?.data?.data;
              if (gradeRes?.data?.success && Array.isArray(arr) && arr.length > 0) {
                const result = arr[0];
                isCorrect = extractIsCorrect(result);
              } else {
                isCorrect = local === true;
              }
            } catch (err) {
              console.error('FRQ grading error:', err?.message);
              isCorrect = local === true;
            }
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

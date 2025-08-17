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

// ---- Config choices ----
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
const prune = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
);
const pickFirstQuestion = (arr) => Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
const clean = (s) => String(s).trim().toUpperCase()
  .replace(/[^\p{L}\p{N} ]/gu, '')
  .replace(/\s+/g, ' ');

// MCQ helpers
function buildMcqHelpers(options = []) {
  const letters = Array.from({ length: options.length }, (_, i) => String.fromCharCode(65 + i)); // A,B,C...
  const textUpper = options.map(clean);

  const letterToIndex = Object.fromEntries(letters.map((L, i) => [L, i]));
  const textToIndex = Object.fromEntries(textUpper.map((t, i) => [t, i]));

  const tokenToIndex = (tok) => {
    if (tok == null) return null;
    const raw = String(tok).trim();
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      if (n >= 0 && n < options.length) return n;      // 0-based
      if (n >= 1 && n <= options.length) return n - 1; // 1-based
    }
    const L = raw.toUpperCase()[0];
    if (letterToIndex[L] !== undefined) return letterToIndex[L];
    const txt = clean(raw);
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

function makeKey() {
  return crypto.randomBytes(8).toString('hex'); // 16 chars
}

// ---- One-time handlers: button + modal + explain ----
function ensureHandlers(client) {
  if (client._aeHandlersInstalled) return;
  client._aeHandlersInstalled = true;
  client._aeQuestionCache = new Map(); // key -> question object
  client._aeLastAnswer = new Map();    // key -> last user answer (string)

  client.on('interactionCreate', async (i) => {
    try {
      // Submit Answer button → show modal
      if (i.isButton() && i.customId.startsWith('ae:answer:')) {
        // ae:answer:<key>:by:<userId>
        const [, , key, , ownerId] = i.customId.split(':');
        if (ownerId && i.user.id !== ownerId) {
          return i.reply({ content: "This question wasn't generated for you.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`ae:submit:${key}:by:${i.user.id}`)
          .setTitle('Submit Your Answer');

        const input = new TextInputBuilder()
          .setCustomId('answer_input')
          .setLabel('Your answer (A/B/C/etc., or text)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
        return;
      }

      // Explain button → call explain endpoint
      if (i.isButton() && i.customId.startsWith('ae:explain:')) {
        // ae:explain:<key>:by:<userId>
        const [, , key, , ownerId] = i.customId.split(':');
        if (ownerId && i.user.id !== ownerId) {
          return i.reply({ content: "This explanation isn't for you.", ephemeral: true });
        }

        const question = i.client._aeQuestionCache.get(key);
        if (!question) {
          return i.reply({ content: 'This question has expired. Please run the command again.', ephemeral: true });
        }

        // If user already submitted an answer, include it; otherwise omit
        const maybeAnswer = i.client._aeLastAnswer.get(key);
        let explanation = '';

        try {
          const body = {
            question, // per docs
            ...(maybeAnswer ? { userAnswer: maybeAnswer } : {}),
            event: question.event
          };
          const r = await axios.post('https://scio.ly/api/gemini/explain', body, { timeout: 30000 });

          // Be defensive about shape
          explanation =
            r.data?.data?.explanation ??
            r.data?.data?.text ??
            (Array.isArray(r.data?.data?.explanations) ? r.data.data.explanations[0] : undefined) ??
            r.data?.message ??
            'No explanation provided.';

        } catch (err) {
          console.error('Explain error:', err?.message);
          return i.reply({ content: 'Failed to generate an explanation. Please try again shortly.', ephemeral: true });
        }

        // Trim explanation if it’s too long for an embed description
        if (explanation.length > 3900) explanation = explanation.slice(0, 3900) + '…';

        const exEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Explanation')
          .setDescription(`**Question:** ${question.question}\n\n${explanation}`);

        return i.reply({ embeds: [exEmbed], ephemeral: true });
      }

      // Modal submit → grade
      if (i.isModalSubmit() && i.customId.startsWith('ae:submit:')) {
        // ae:submit:<key>:by:<userId>
        const [, , key, , ownerId] = i.customId.split(':');
        if (ownerId && i.user.id !== ownerId) {
          return i.reply({ content: "This form isn't for you.", ephemeral: true });
        }

        const userAnswerRaw = i.fields.getTextInputValue('answer_input');
        const question = i.client._aeQuestionCache.get(key);
        if (!question) {
          return i.reply({ content: 'This question has expired. Please run the command again.', ephemeral: true });
        }

        // keep last answer for the explain call
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
              isCorrect = userSorted.length === correctSorted.length &&
                          correctSorted.every((v, idx) => v === userSorted[idx]);
            }

            shownCorrect = correctSorted.map(indexToLetter).join(', ');
          } else {
            // fallback to raw answers
            const raw = Array.isArray(question.answers) ? question.answers : [question.answers];
            shownCorrect = raw.map(a => String(a)).join(', ');
            isCorrect = false;
          }
        } else {
          // FRQ → grade via API
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

            const ok = gradeRes.data?.success && Array.isArray(gradeRes.data?.data) && gradeRes.data.data.length > 0;
            if (!ok) throw new Error('Bad grading response');

            const result = gradeRes.data.data[0];
            isCorrect = Boolean(result.isCorrect ?? result.correct ?? false);

            const raw = Array.isArray(question.answers) ? question.answers : [question.answers];
            shownCorrect = raw.map(a => String(a)).join(', ');
          } catch (err) {
            console.error('FRQ grading error:', err?.message);
            return i.reply({ content: 'Grading failed. Please try again shortly.', ephemeral: true });
          }
        }

        const resEmbed = new EmbedBuilder()
          .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
          .setTitle(isCorrect ? '**Correct!**' : '**Incorrect**')
          .addFields(
            { name: '**Your Answer:**', value: String(userAnswerRaw), inline: true },
            { name: '**Correct Answer(s):**', value: shownCorrect || '—', inline: true },
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

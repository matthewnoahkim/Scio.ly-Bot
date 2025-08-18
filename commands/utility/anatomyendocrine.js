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

// ---------- Config ----------
const API_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY || 'xo9IKNJG65e0LMBa55Tq';
const FRQ_CORRECT_THRESHOLD =
  Number.isFinite(Number(process.env.SCIO_FRQ_CORRECT_THRESHOLD))
    ? Number(process.env.SCIO_FRQ_CORRECT_THRESHOLD)
    : 0.75;

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  },
});

// Store per-message question state so our buttons/modals work without touching your global InteractionCreate
const questionState = new Map();

// ---------- Options / UI ----------
const questionTypeOptions = ['MCQ', 'FRQ'];
const divisionOptions = ['Division B', 'Division C'];
const difficultyOptions = [
  'Very Easy (0-19%)',
  'Easy (20-39%)',
  'Medium (40-59%)',
  'Hard (60-79%)',
  'Very Hard (80-100%)',
];
const subtopicOptions = ['Hormones', 'Glands', 'Regulation', 'Feedback', 'Development'];

const difficultyMap = {
  'Very Easy (0-19%)': { min: 0.0, max: 0.19 },
  'Easy (20-39%)': { min: 0.2, max: 0.39 },
  'Medium (40-59%)': { min: 0.4, max: 0.59 },
  'Hard (60-79%)': { min: 0.6, max: 0.79 },
  'Very Hard (80-100%)': { min: 0.8, max: 1.0 },
};

// ---------- Helpers ----------
function formatChoices(options = []) {
  return options.map((opt, i) => `**${String.fromCharCode(65 + i)})** ${opt}`).join('\n');
}
function percentFromDifficulty(d) {
  const n = typeof d === 'number' ? d : 0;
  return `${Math.round(n * 100)}%`;
}
function resolveCorrectIndex(question) {
  const options = question.options || [];

  if (typeof question.correctIndex === 'number') {
    const idx = question.correctIndex;
    return { index: Number.isInteger(idx) ? idx : null, text: options[idx] ?? null };
  }

  const answers = Array.isArray(question.answers)
    ? question.answers
    : question.answers != null
    ? [question.answers]
    : [];

  const first = answers[0];

  if (typeof first === 'number' && Number.isInteger(first)) {
    const idx = first;
    return { index: idx, text: options[idx] ?? null };
  }
  if (typeof first === 'string' && /^[A-Za-z]$/.test(first.trim())) {
    const idx = first.trim().toUpperCase().charCodeAt(0) - 65;
    return { index: idx, text: options[idx] ?? null };
  }
  if (typeof first === 'string' && options.length) {
    const idx = options.findIndex(
      (o) => String(o).trim().toLowerCase() === first.trim().toLowerCase()
    );
    if (idx !== -1) return { index: idx, text: options[idx] };
  }
  return { index: null, text: null };
}
function userMcqIndex(input, options = []) {
  if (!input) return null;
  const trimmed = String(input).trim();

  const letterParen = trimmed.match(/^([A-H])\)/i);
  if (letterParen) return letterParen[1].toUpperCase().charCodeAt(0) - 65;

  const letter = trimmed.match(/^[A-H]/i);
  if (letter) return letter[0].toUpperCase().charCodeAt(0) - 65;

  const idx = options.findIndex(
    (o) => String(o).trim().toLowerCase() === trimmed.toLowerCase()
  );
  return idx === -1 ? null : idx;
}

// ---------- Command ----------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('anatomyendocrine')
    .setDescription('Get an Anatomy - Endocrine question')
    .addStringOption((option) =>
      option
        .setName('question_type')
        .setDescription('Question type (leave blank for random)')
        .setRequired(false)
        .addChoices(...questionTypeOptions.map((q) => ({ name: q, value: q.toLowerCase() })))
    )
    .addStringOption((option) =>
      option
        .setName('division')
        .setDescription('Division (leave blank for random)')
        .setRequired(false)
        .addChoices(...divisionOptions.map((d) => ({ name: d, value: d.split(' ')[1] })))
    )
    .addStringOption((option) =>
      option
        .setName('difficulty')
        .setDescription('Difficulty (leave blank for random)')
        .setRequired(false)
        .addChoices(...difficultyOptions.map((d) => ({ name: d, value: d })))
    )
    .addStringOption((option) =>
      option
        .setName('subtopic')
        .setDescription('Subtopic (leave blank for random)')
        .setRequired(false)
        .addChoices(...subtopicOptions.map((s) => ({ name: s, value: s })))
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply(); // public

      const questionType = interaction.options.getString('question_type'); // 'mcq' | 'frq' | null
      const division = interaction.options.getString('division'); // 'B' | 'C' | null
      const difficultyLabel = interaction.options.getString('difficulty');
      const subtopic = interaction.options.getString('subtopic');

      let difficulty_min, difficulty_max;
      if (difficultyLabel && difficultyMap[difficultyLabel]) {
        difficulty_min = difficultyMap[difficultyLabel].min;
        difficulty_max = difficultyMap[difficultyLabel].max;
      }

      // Fetch one question
      const query = {
        event: 'Anatomy - Endocrine',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType,
        limit: 1,
      };

      const res = await api.get('/api/questions', { params: query });

      if (!res.data?.success || !res.data?.data || res.data.data.length === 0) {
        await interaction.editReply({
          content: 'No questions found matching your criteria. Try different filters.',
        });
        return;
      }

      const question = res.data.data[0] || {};
      const isMcq = Array.isArray(question.options) && question.options.length > 0;

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('Anatomy - Endocrine')
        .setDescription(question.question || '—');

      const fields = [];

      if (isMcq) {
        fields.push({
          name: '**Answer Choices:**',
          value: formatChoices(question.options),
          inline: false,
        });
      }

      fields.push(
        {
          name: '**Division:**',
          value: String(question.division || division || '—'),
          inline: true,
        },
        {
          name: '**Difficulty:**',
          value: percentFromDifficulty(question.difficulty),
          inline: true,
        },
        {
          name: '**Subtopic(s):**',
          value:
            (Array.isArray(question.subtopics) && question.subtopics.length
              ? question.subtopics.join(', ')
              : question.subtopic || 'None') || 'None',
          inline: false,
        }
      );

      embed.addFields(fields).setFooter({
        text: 'Use the buttons below to check your answer or get an explanation.',
      });

      // Buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ae_check_answer')
          .setLabel('Check Answer')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ae_explain')
          .setLabel('Explain Question')
          .setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.editReply({ embeds: [embed], components: [buttons] });

      // Store state for this message
      questionState.set(msg.id, {
        question,
        createdAt: Date.now(),
      });

      // Collector: keep it alive for a long session; both buttons can be pressed any number of times
      const collector = msg.createMessageComponentCollector({
        time: 6 * 60 * 60 * 1000, // 6 hours
      });

      collector.on('collect', async (btnInteraction) => {
        try {
          if (!['ae_check_answer', 'ae_explain'].includes(btnInteraction.customId)) return;

          const state = questionState.get(msg.id);
          if (!state) {
            await btnInteraction.reply({
              ephemeral: true,
              content: 'This question session expired. Please run the command again.',
            });
            return;
          }

          // Hard TTL to avoid grading very old questions
          if (Date.now() - state.createdAt > 24 * 60 * 60 * 1000) {
            await btnInteraction.reply({
              ephemeral: true,
              content:
                'This question is over a day old. Please run the command again for a fresh session.',
            });
            return;
          }

          const q = state.question || {};
          const isMcqLocal = Array.isArray(q.options) && q.options.length > 0;

          if (btnInteraction.customId === 'ae_explain') {
            await btnInteraction.deferReply({ ephemeral: true });
            try {
              // Per your spec: only send the question object
              const explainRes = await api.post('/api/gemini/explain', {
                question: q,
              });
              const expl = explainRes?.data?.data?.explanation || 'No explanation available.';
              await btnInteraction.editReply({
                content: `**Explanation:**\n${String(expl).slice(0, 1900)}`,
              });
            } catch (e) {
              console.error('Explain error:', e?.response?.data || e);
              const msg =
                e?.response?.status === 429
                  ? 'Rate limit exceeded. Please try again in a few moments.'
                  : 'Failed to get an explanation. Please try again later.';
              await btnInteraction.editReply({ content: msg });
            }
            return;
          }

          if (btnInteraction.customId === 'ae_check_answer') {
            // Show modal for the user's answer
            const modal = new ModalBuilder()
              .setCustomId(`ae_modal_${msg.id}`)
              .setTitle(isMcqLocal ? 'Enter your answer letter' : 'Enter your answer');

            const input = new TextInputBuilder()
              .setCustomId('user_answer')
              .setLabel(isMcqLocal ? 'Your Answer (e.g., A, B, C...)' : 'Your Answer')
              .setRequired(true)
              .setStyle(isMcqLocal ? TextInputStyle.Short : TextInputStyle.Paragraph)
              .setPlaceholder(isMcqLocal ? 'A' : 'Type your free-response answer');

            modal.addComponents(new ActionRowBuilder().addComponents(input));

            await btnInteraction.showModal(modal);

            const submitted = await btnInteraction.awaitModalSubmit({
              time: 2 * 60 * 1000,
              filter: (i) =>
                i.customId === `ae_modal_${msg.id}` && i.user.id === btnInteraction.user.id,
            });

            const userAnswerRaw = submitted.fields.getTextInputValue('user_answer') || '';
            const userAnswer = userAnswerRaw.trim();

            if (isMcqLocal) {
              const options = q.options || [];
              const { index: correctIndex } = resolveCorrectIndex(q);
              const userIndex = userMcqIndex(userAnswer, options);

              const correctLetter =
                correctIndex != null ? String.fromCharCode(65 + correctIndex) : '—';
              const userLetter =
                userIndex != null ? String.fromCharCode(65 + userIndex) : userAnswer.toUpperCase();

              const isCorrect =
                correctIndex != null && userIndex != null && correctIndex === userIndex;

              const result =
                correctIndex == null
                  ? '⚠️ Could not determine the correct answer from the question data.'
                  : isCorrect
                  ? '✅ Correct!'
                  : '❌ Incorrect.';

              const correctText =
                correctIndex != null && options[correctIndex]
                  ? ` (${options[correctIndex]})`
                  : '';

              await submitted.reply({
                ephemeral: true,
                content: [
                  `**${result}**`,
                  `**Your answer:** ${userLetter}`,
                  `**Correct answer:** ${correctLetter}${correctText}`,
                ].join('\n'),
              });
            } else {
              // FRQ grading via AI — per your schema
              const correctAnswersArr = Array.isArray(q.answers)
                ? q.answers.map((a) => String(a))
                : q.answers != null
                ? [String(q.answers)]
                : [];

              try {
                const gradeRes = await api.post('/api/gemini/grade-free-responses', {
                  responses: [
                    {
                      question: q.question || '',
                      correctAnswers: correctAnswersArr,
                      studentAnswer: userAnswer,
                    },
                  ],
                });

                const grades = gradeRes?.data?.data?.grades || [];
                const first = grades[0] || {};
                const score = typeof first.score === 'number' ? first.score : null;
                const isCorrect =
                  score == null ? null : Number(score) >= Number(FRQ_CORRECT_THRESHOLD);

                const verdict =
                  isCorrect == null
                    ? '⚠️ Could not determine correctness from the grader.'
                    : isCorrect
                    ? '✅ Correct!'
                    : '❌ Not quite.';

                const feedback = first.feedback ? `\n**Feedback:** ${first.feedback}` : '';
                const keyPts = Array.isArray(first.keyPoints) && first.keyPoints.length
                  ? `\n**Key points:** ${first.keyPoints.join('; ')}`
                  : '';
                const suggestions = Array.isArray(first.suggestions) && first.suggestions.length
                  ? `\n**Suggestions:** ${first.suggestions.join('; ')}`
                  : '';
                const correctDisplay =
                  correctAnswersArr.length > 0
                    ? `\n**Correct answer(s):** ${correctAnswersArr.join(', ')}`
                    : '';

                await submitted.reply({
                  ephemeral: true,
                  content:
                    `**FRQ Grade:** ${verdict}${score != null ? ` (score: ${score})` : ''}\n` +
                    `**Your answer:** ${userAnswer}` +
                    correctDisplay +
                    feedback +
                    keyPts +
                    suggestions,
                });
              } catch (e) {
                console.error('FRQ grade error:', e?.response?.data || e);
                const msg =
                  e?.response?.status === 429
                    ? 'Rate limit exceeded. Please try again in a few moments.'
                    : 'Grading failed. Please try again later.';
                await submitted.reply({ ephemeral: true, content: msg });
              }
            }
          }
        } catch (err) {
          console.error('Button/Modal flow error:', err);
          try {
            if (btnInteraction.deferred || btnInteraction.replied) {
              await btnInteraction.followUp({
                ephemeral: true,
                content: 'Something went wrong handling that action.',
              });
            } else {
              await btnInteraction.reply({
                ephemeral: true,
                content: 'Something went wrong handling that action.',
              });
            }
          } catch {}
        }
      });

      collector.on('end', () => {
        // Keep buttons visually enabled; session state is still TTL-guarded above.
        // Cleanup if you want:
        // questionState.delete(msg.id);
      });
    } catch (err) {
      console.error('Error in Anatomy Endocrine command:', err?.response?.data || err);
      const content =
        err?.response?.status === 429
          ? 'Rate limit exceeded. Please try again in a few moments.'
          : 'Command failed. Please try again later.';
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content }).catch(() => {});
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => {});
      }
    }
  },
};

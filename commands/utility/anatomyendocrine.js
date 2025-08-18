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
  ComponentType,
} = require('discord.js');
const axios = require('axios');

// ====== Config ======
const SCIO_API_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY || 'xo9IKNJG65e0LMBa55Tq'; // set via env ideally
const REQUEST_HEADERS = API_KEY
  ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` }
  : {};

// ---- Options UI ----
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

// ===== Helpers =====
function toDivisionLabel(div) {
  if (!div) return '—';
  const d = String(div).toUpperCase();
  if (d === 'B') return 'Division B';
  if (d === 'C') return 'Division C';
  return d;
}
function letterFromIndex(idx) {
  return String.fromCharCode(65 + idx);
}
function normalize(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
/** Resolve MCQ correct index robustly (0/1-based index or text). */
function resolveCorrectIndex(question) {
  const { options = [], answers = [] } = question || {};
  if (!Array.isArray(options) || options.length === 0) return null;
  const a0 = answers?.[0];

  if (typeof a0 === 'number' && Number.isFinite(a0)) {
    if (a0 >= 0 && a0 < options.length) return a0; // 0-based
    if (a0 >= 1 && a0 <= options.length) return a0 - 1; // 1-based
  } else if (typeof a0 === 'string') {
    const target = normalize(a0);
    const idx = options.findIndex((opt) => normalize(opt) === target);
    if (idx !== -1) return idx;
  }
  console.warn('[anatomyendocrine] Could not resolve correct index from answers:', answers);
  return 0;
}
/** Build the main question embed (no ID shown). */
function buildQuestionEmbed(question) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('Anatomy - Endocrine')
    .setDescription(question.question || 'No question text');

  const fields = [];

  // Answer choices (if MCQ)
  if (Array.isArray(question.options) && question.options.length > 0) {
    const answerChoices = question.options
      .map((opt, i) => `**${letterFromIndex(i)})** ${opt}`)
      .join('\n');
    fields.push({ name: 'Answer Choices', value: answerChoices, inline: false });
  }

  fields.push(
    { name: 'Division', value: toDivisionLabel(question.division), inline: true },
    {
      name: 'Difficulty',
      value: typeof question.difficulty === 'number' ? `${Math.round(question.difficulty * 100)}%` : '—',
      inline: true,
    },
    {
      name: 'Subtopic(s)',
      value: Array.isArray(question.subtopics) && question.subtopics.length ? question.subtopics.join(', ') : 'None',
      inline: true,
    },
  );

  embed.addFields(fields);
  embed.setFooter({ text: 'Use the buttons below.' });
  return embed;
}
/** Buttons row */
function buildButtonsRow(qid) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`check_${qid}`).setLabel('Check answer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`explain_${qid}`).setLabel('Explain question').setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anatomyendocrine')
    .setDescription('Get an Anatomy - Endocrine question')
    .addStringOption((option) =>
      option
        .setName('question_type')
        .setDescription('Question type (leave blank for random)')
        .setRequired(false)
        .addChoices(...questionTypeOptions.map((q) => ({ name: q, value: q.toLowerCase() }))),
    )
    .addStringOption((option) =>
      option
        .setName('division')
        .setDescription('Division (leave blank for random)')
        .setRequired(false)
        .addChoices(...divisionOptions.map((d) => ({ name: d, value: d.split(' ')[1] }))),
    )
    .addStringOption((option) =>
      option
        .setName('difficulty')
        .setDescription('Difficulty (leave blank for random)')
        .setRequired(false)
        .addChoices(...difficultyOptions.map((d) => ({ name: d, value: d }))),
    )
    .addStringOption((option) =>
      option
        .setName('subtopic')
        .setDescription('Subtopic (leave blank for random)')
        .setRequired(false)
        .addChoices(...subtopicOptions.map((s) => ({ name: s, value: s }))),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      // Collect options
      const questionType = interaction.options.getString('question_type'); // 'mcq' or 'frq'
      const division = interaction.options.getString('division'); // 'B' or 'C'
      const difficultyLabel = interaction.options.getString('difficulty');
      const subtopic = interaction.options.getString('subtopic');

      let difficulty_min, difficulty_max;
      if (difficultyLabel && difficultyMap[difficultyLabel]) {
        difficulty_min = difficultyMap[difficultyLabel].min;
        difficulty_max = difficultyMap[difficultyLabel].max;
      }

      // Build query
      const query = {
        event: 'Anatomy - Endocrine',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType, // adjust if your API uses a different param
        limit: 1,
      };

      // Fetch question
      const res = await axios.get(`${SCIO_API_BASE}/api/questions`, {
        params: query,
        headers: REQUEST_HEADERS,
      });

      if (!res.data?.success || !Array.isArray(res.data?.data) || res.data.data.length === 0) {
        await interaction.editReply({
          content: 'No questions found matching your criteria. Try different filters.',
        });
        return;
      }

      const question = res.data.data[0];

      // Send the embed (public) with buttons
      const embed = buildQuestionEmbed(question);
      const components = [buildButtonsRow(question.id || interaction.id)];
      const sent = await interaction.editReply({ embeds: [embed], components });

      // Per-message collector; no changes to your global InteractionCreate needed
      const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30 * 60 * 1000, // 30 minutes
        filter: (i) => i.message.id === sent.id,
      });

      collector.on('collect', async (btn) => {
        try {
          if (btn.user.id !== interaction.user.id) {
            await btn.reply({ content: 'Only the original requester can use these buttons.', ephemeral: true });
            return;
          }

          if (btn.customId === `check_${question.id || interaction.id}`) {
            const isMCQ = Array.isArray(question.options) && question.options.length > 0;
            const modalId = `check_modal_${sent.id}`;

            const modal = new ModalBuilder().setCustomId(modalId).setTitle('Check your answer');
            const input = new TextInputBuilder()
              .setCustomId('answer_input')
              .setLabel(isMCQ ? 'Your answer (A, B, C, ...)' : 'Your answer')
              .setStyle(isMCQ ? TextInputStyle.Short : TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder(isMCQ ? 'e.g., A' : 'Type your free-response here');
            modal.addComponents(new ActionRowBuilder().addComponents(input));

            await btn.showModal(modal);

            // Wait for the modal submit from same user
            let submission;
            try {
              submission = await btn.awaitModalSubmit({
                time: 5 * 60 * 1000,
                filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
              });
            } catch {
              return;
            }

            const userAnswerRaw = submission.fields.getTextInputValue('answer_input');
            const userAnswer = String(userAnswerRaw || '').trim();

            if (isMCQ) {
              const options = question.options || [];
              if (!options.length) {
                await submission.reply({ content: 'This question has no options — cannot check as MCQ.', ephemeral: true });
                return;
              }

              const letter = (userAnswer[0] || '').toUpperCase();
              const idx = letter.charCodeAt(0) - 65;
              if (!(idx >= 0 && idx < options.length)) {
                await submission.reply({
                  content: `Invalid choice. Please enter a letter between A and ${letterFromIndex(options.length - 1)}.`,
                  ephemeral: true,
                });
                return;
              }

              const correctIdx = resolveCorrectIndex(question);
              const correctLetter = letterFromIndex(correctIdx);
              const correctText = options[correctIdx];
              const userText = options[idx];

              const correct = idx === correctIdx;
              await submission.reply({
                ephemeral: true,
                content:
                  (correct ? '✅ **Correct!**' : '❌ **Incorrect.**') +
                  `\n**Your answer:** ${letter}) ${userText}\n**Correct answer:** ${correctLetter}) ${correctText}`,
              });
            } else {
              // FRQ grading via API
              try {
                const gradeRes = await axios.post(
                  `${SCIO_API_BASE}/api/gemini/grade-free-responses`,
                  {
                    responses: [
                      {
                        question: question.question,
                        correctAnswers: Array.isArray(question.answers) ? question.answers : [],
                        studentAnswer: userAnswer,
                      },
                    ],
                  },
                  { headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json' } },
                );

                const grade = gradeRes.data?.data?.grades?.[0];
                if (!grade) {
                  await submission.reply({
                    ephemeral: true,
                    content: 'Grading service did not return a result. Please try again shortly.',
                  });
                  return;
                }

                const scorePct = typeof grade.score === 'number' ? Math.round(grade.score * 100) : null;
                const feedback = grade.feedback || 'No feedback provided.';
                const correctAnswers =
                  Array.isArray(question.answers) && question.answers.length
                    ? question.answers.join('; ')
                    : '—';

                await submission.reply({
                  ephemeral: true,
                  content:
                    `🧠 **Grading Result**` +
                    (scorePct !== null ? ` — **${scorePct}%**` : '') +
                    `\n**Your answer:** ${userAnswer}\n**Expected key points / answers:** ${correctAnswers}\n\n**Feedback:** ${feedback}`,
                });
              } catch (err) {
                if (err?.response?.status === 429) {
                  await submission.reply({
                    ephemeral: true,
                    content: '⏳ The grading service is rate-limited right now. Please try again in a moment.',
                  });
                } else {
                  console.error('[anatomyendocrine] FRQ grading error:', err?.response?.data || err);
                  await submission.reply({
                    ephemeral: true,
                    content: 'Grading failed. Please try again shortly.',
                  });
                }
              }
            }
          } else if (btn.customId === `explain_${question.id || interaction.id}`) {
            await btn.deferReply({ ephemeral: true });
            try {
              const explainRes = await axios.post(
                `${SCIO_API_BASE}/api/gemini/explain`,
                {
                  question,            // pass the full question object
                  event: 'Anatomy - Endocrine',
                  streaming: false,
                },
                { headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json' } },
              );

              const explanation = explainRes.data?.data?.explanation || 'No explanation was returned.';
              await btn.editReply({ content: `📘 **Explanation**\n${explanation}` });
            } catch (err) {
              if (err?.response?.status === 429) {
                await btn.editReply({
                  content: '⏳ The explanation service is rate-limited right now. Please try again in a moment.',
                });
              } else {
                console.error('[anatomyendocrine] Explain error:', err?.response?.data || err);
                await btn.editReply({
                  content: 'Could not fetch an explanation at the moment. Please try again shortly.',
                });
              }
            }
          }
        } catch (innerErr) {
          console.error('[anatomyendocrine] Button handler error:', innerErr);
          try {
            if (!btn.replied && !btn.deferred) {
              await btn.reply({ content: 'Something went wrong handling that action.', ephemeral: true });
            }
          } catch {}
        }
      });

      collector.on('end', () => {
        // No-op; buttons visually remain but won’t be handled after timeout.
      });
    } catch (err) {
      console.error('Error in Anatomy Endocrine command:', err);
      if (err?.response?.status === 429) {
        await interaction.editReply({ content: 'Rate limit exceeded. Please try again in a few moments.' });
      } else {
        await interaction.editReply({ content: 'Command failed. Please try again later.' });
      }
    }
  },
};

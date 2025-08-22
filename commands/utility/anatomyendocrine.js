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
const PRIMARY_BASE = 'https://scio.ly';
const FALLBACK_BASE = 'https://scioly-api.vercel.app';
const API_KEY = process.env.SCIO_API_KEY || 'xo9IKNJG65e0LMBa55Tq'; 
const AUTH_HEADERS = API_KEY
  ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` }
  : {};

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
function buildQuestionEmbed(question) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('Anatomy - Endocrine')
    .setDescription(question.question || 'No question text');

  const fields = [];
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
function buildButtonsRow(qid) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`check_${qid}`).setLabel('Check answer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`explain_${qid}`).setLabel('Explain question').setStyle(ButtonStyle.Secondary),
  );
}

// ---------- Network helpers with smart fallbacks ----------
async function getJSON(base, path, params) {
  try {
    const res = await axios.get(`${base}${path}`, { params, headers: AUTH_HEADERS });
    return res;
  } catch (err) {
    console.error('[GET]', path, 'status:', err?.response?.status, 'data:', err?.response?.data);
    throw err;
  }
}

async function postJSONWithFallbacks(primaryBase, fallbackBase, path, bodyVariants) {
  const headers = { ...AUTH_HEADERS, 'Content-Type': 'application/json' };

  // Try each body variant against primary, then fallback host.
  for (const body of bodyVariants) {
    try {
      const res = await axios.post(`${primaryBase}${path}`, body, { headers });
      return res;
    } catch (err) {
      console.error('[POST primary]', path, 'bodyKeys:', Object.keys(body), 'status:', err?.response?.status, 'data:', err?.response?.data);
      // Try fallback host immediately for this body variant
      try {
        const res2 = await axios.post(`${fallbackBase}${path}`, body, { headers });
        return res2;
      } catch (err2) {
        console.error('[POST fallback]', path, 'bodyKeys:', Object.keys(body), 'status:', err2?.response?.status, 'data:', err2?.response?.data);
        // continue loop to next body variant
      }
    }
  }
  // If all attempts fail, throw a generic error
  throw new Error('All AI endpoint attempts failed');
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

      const questionType = interaction.options.getString('question_type');
      const division = interaction.options.getString('division');
      const difficultyLabel = interaction.options.getString('difficulty');
      const subtopic = interaction.options.getString('subtopic');

      let difficulty_min, difficulty_max;
      if (difficultyLabel && difficultyMap[difficultyLabel]) {
        difficulty_min = difficultyMap[difficultyLabel].min;
        difficulty_max = difficultyMap[difficultyLabel].max;
      }

      const query = {
        event: 'Anatomy - Endocrine',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType,
        limit: 1,
      };

      // Fetch question (primary only; /api/questions should be solid)
      const res = await getJSON(PRIMARY_BASE, '/api/questions', query);
      if (!res.data?.success || !Array.isArray(res.data?.data) || res.data.data.length === 0) {
        await interaction.editReply({ content: 'No questions found matching your criteria. Try different filters.' });
        return;
      }

      const question = res.data.data[0];
      const embed = buildQuestionEmbed(question);
      const components = [buildButtonsRow(question.id || interaction.id)];
      const sent = await interaction.editReply({ embeds: [embed], components });

      const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30 * 60 * 1000,
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
              // FRQ grading with resilient body/host fallbacks
              try {
                const correctAnswers =
                  Array.isArray(question.answers)
                    ? question.answers.map(a => String(a))
                    : (typeof question.answers === 'string' ? [question.answers] : []);

                const bodyVariants = [
                  { responses: [{ question: question.question, correctAnswers, studentAnswer: userAnswer }] },     // per docs
                  { freeResponses: [{ question: question.question, correctAnswers, studentAnswer: userAnswer }] }, // legacy shape
                ];

                const gradeRes = await postJSONWithFallbacks(PRIMARY_BASE, FALLBACK_BASE, '/api/gemini/grade-free-responses', bodyVariants);
                const grade = gradeRes.data?.data?.grades?.[0];

                if (!grade) {
                  // Some backends may return data array directly
                  const altGrade = Array.isArray(gradeRes.data?.data) ? gradeRes.data.data[0] : null;
                  if (!altGrade) {
                    await submission.reply({
                      ephemeral: true,
                      content: 'Grading service did not return a result. Please try again shortly.',
                    });
                    return;
                  }
                }

                const result = grade || gradeRes.data.data[0];
                const scorePct = typeof result.score === 'number' ? Math.round(result.score * 100) : null;
                const feedback = result.feedback || 'No feedback provided.';
                const correctAnswersDisplay = correctAnswers.length ? correctAnswers.join('; ') : '—';

                await submission.reply({
                  ephemeral: true,
                  content:
                    `🧠 **Grading Result**` +
                    (scorePct !== null ? ` — **${scorePct}%**` : '') +
                    `\n**Your answer:** ${userAnswer}\n**Expected key points / answers:** ${correctAnswersDisplay}\n\n**Feedback:** ${feedback}`,
                });
              } catch (err) {
                if (err?.response?.status === 429) {
                  await submission.reply({ ephemeral: true, content: '⏳ The grading service is rate-limited right now. Please try again in a moment.' });
                } else if (err?.response?.status === 401 || err?.response?.status === 403) {
                  await submission.reply({ ephemeral: true, content: '🔒 Authentication failed for grading. Check your API key headers.' });
                } else {
                  await submission.reply({ ephemeral: true, content: 'Grading failed. Please try again shortly.' });
                }
              }
            }
          } else if (btn.customId === `explain_${question.id || interaction.id}`) {
            await btn.deferReply({ ephemeral: true });
            try {
              // Prefer sending a compact question object
              const compact = {
                id: question.id,
                question: question.question,
                event: question.event || 'Anatomy - Endocrine',
                division: question.division,
                options: question.options,
                answers: question.answers,
                subtopics: question.subtopics,
                difficulty: question.difficulty,
              };

              const bodyVariants = [
                { question: compact, event: 'Anatomy - Endocrine', streaming: false }, // per docs (object)
                { question: question.question, event: 'Anatomy - Endocrine', streaming: false }, // fallback (string)
              ];

              const explainRes = await postJSONWithFallbacks(PRIMARY_BASE, FALLBACK_BASE, '/api/gemini/explain', bodyVariants);
              const explanation =
                explainRes.data?.data?.explanation ||
                (typeof explainRes.data?.data === 'string' ? explainRes.data.data : null) ||
                'No explanation was returned.';
              await btn.editReply({ content: `📘 **Explanation**\n${explanation}` });
            } catch (err) {
              if (err?.response?.status === 429) {
                await btn.editReply({ content: '⏳ The explanation service is rate-limited right now. Please try again in a moment.' });
              } else if (err?.response?.status === 401 || err?.response?.status === 403) {
                await btn.editReply({ content: '🔒 Authentication failed for explanation. Check your API key headers.' });
              } else {
                await btn.editReply({ content: 'Could not fetch an explanation at the moment. Please try again shortly.' });
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

      collector.on('end', () => { /* buttons stop being handled after 30m; visuals remain */ });
    } catch (err) {
      console.error('Error in Anatomy Endocrine command:', err?.response?.data || err);
      if (err?.response?.status === 429) {
        await interaction.editReply({ content: 'Rate limit exceeded. Please try again in a few moments.' });
      } else if (err?.response?.status === 401 || err?.response?.status === 403) {
        await interaction.editReply({ content: '🔒 Authentication failed. Check your API key headers.' });
      } else {
        await interaction.editReply({ content: 'Command failed. Please try again later.' });
      }
    }
  },
};

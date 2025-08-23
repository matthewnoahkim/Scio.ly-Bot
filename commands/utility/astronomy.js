// /commands/astronomy.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType
} = require('discord.js');
const axios = require('axios');
const { EVENT_RULES } = require('../../event-rules'); // <-- new shared rules
const { letterFromIndex, getExplanationWithRetry } = require('../../shared-utils');

// ====== Config ======
const EVENT_NAME = 'Astronomy';
const RULES = EVENT_RULES[EVENT_NAME] || { divisions: [], allowedSubtopics: [], allowImages: false };

const PRIMARY_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY;
if (!API_KEY) {
  console.warn('[astronomy] No SCIO_API_KEY found in environment variables. API calls may fail.');
}
const AUTH_HEADERS = API_KEY
  ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` }
  : {};

// Colors
const COLOR_BLUE = 0x2b90d9;
const COLOR_GREEN = 0x3fbf7f;
const COLOR_RED = 0xff5555;

// ===== Helpers =====
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
  console.warn('[astronomy] Could not resolve correct index from answers:', answers);
  return 0;
}

function buildQuestionEmbed(question) {
  const embed = new EmbedBuilder()
    .setColor(COLOR_BLUE)
    .setTitle(EVENT_NAME)
    .setDescription(question.question || 'No question text');

  const fields = [];
  if (Array.isArray(question.options) && question.options.length > 0) {
    const answerChoices = question.options
      .map((opt, i) => `**${letterFromIndex(i)})** ${opt}`)
      .join('\n');
    fields.push({ name: 'Answer Choices', value: answerChoices, inline: false });
  }

  fields.push(
    { name: 'Division', value: String(question.division ?? '—'), inline: true },
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

  // Show one image in the embed if allowed for this event
  if (RULES.allowImages) {
    if (question.imageData) {
      embed.setImage(question.imageData);
    } else if (Array.isArray(question.images) && question.images.length > 0) {
      embed.setImage(question.images[0]);
    }
  }

  return embed;
}

function buildButtonsRow(qid) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`check_${qid}`).setLabel('Check answer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`explain_${qid}`).setLabel('Explain question').setStyle(ButtonStyle.Secondary),
  );
}

function pickFirstQuestion(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data.questions)) return data.questions[0] || null;
  if (data.id || data.base52 || data.question) return data;
  return null;
}

function prune(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

function choiceNameForDivision(v) {
  return v === 'B' ? 'Division B' : v === 'C' ? 'Division C' : v;
}

module.exports = {
  data: (() => {
    const builder = new SlashCommandBuilder()
      .setName('astronomy')
      .setDescription(`Get a ${EVENT_NAME} question`);

    // Division choices from RULES.divisions
    if (Array.isArray(RULES.divisions) && RULES.divisions.length) {
      const divChoices = RULES.divisions.map((d) => ({ name: choiceNameForDivision(d), value: d }));
      builder.addStringOption((option) =>
        option
          .setName('division')
          .setDescription('Division (leave blank for random)')
          .setRequired(false)
          .addChoices(...divChoices),
      );
    }

    // Subtopic choices from RULES.allowedSubtopics
    if (Array.isArray(RULES.allowedSubtopics) && RULES.allowedSubtopics.length) {
      const subChoices = RULES.allowedSubtopics.map((s) => ({ name: s, value: s }));
      builder.addStringOption((option) =>
        option
          .setName('subtopic')
          .setDescription('Subtopic (leave blank for random)')
          .setRequired(false)
          .addChoices(...subChoices),
      );
    }

    // Question type (if you still want MCQ/FRQ filter)
    builder.addStringOption((option) =>
      option
        .setName('question_type')
        .setDescription('Question type (leave blank for random)')
        .setRequired(false)
        .addChoices({ name: 'MCQ', value: 'mcq' }, { name: 'FRQ', value: 'frq' }),
    );

    // Difficulty range label (unchanged)
    builder.addStringOption((option) =>
      option
        .setName('difficulty')
        .setDescription('Difficulty (leave blank for random)')
        .setRequired(false)
        .addChoices(
          { name: 'Very Easy (0-19%)', value: 'Very Easy (0-19%)' },
          { name: 'Easy (20-39%)', value: 'Easy (20-39%)' },
          { name: 'Medium (40-59%)', value: 'Medium (40-59%)' },
          { name: 'Hard (60-79%)', value: 'Hard (60-79%)' },
          { name: 'Very Hard (80-100%)', value: 'Very Hard (80-100%)' },
        ),
    );

    return builder;
  })(),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      // Pull options
      const questionType = interaction.options.getString('question_type');
      let division = interaction.options.getString('division');
      let subtopic = interaction.options.getString('subtopic');
      const difficultyLabel = interaction.options.getString('difficulty');

      // Validate division/subtopic against RULES
      if (division && !RULES.divisions.includes(division)) {
        await interaction.editReply(`This command does not support Division ${division} for **${EVENT_NAME}**.`);
        return;
      }
      if (subtopic && !RULES.allowedSubtopics.includes(subtopic)) {
        await interaction.editReply(`Subtopic **${subtopic}** is not available for **${EVENT_NAME}**.`);
        return;
      }

      // Defaults if user left blank
      if (!division && RULES.divisions.length) {
        division = RULES.divisions[Math.floor(Math.random() * RULES.divisions.length)];
      }
      if (!subtopic && RULES.allowedSubtopics.length) {
        // Let API choose randomly by not passing subtopic — or pick one to bias.
        // We’ll bias to allowed set by picking one at random:
        subtopic = RULES.allowedSubtopics[Math.floor(Math.random() * RULES.allowedSubtopics.length)];
      }

      // Difficulty map (same as before)
      const difficultyMap = {
        'Very Easy (0-19%)': { min: 0.0, max: 0.19 },
        'Easy (20-39%)': { min: 0.2, max: 0.39 },
        'Medium (40-59%)': { min: 0.4, max: 0.59 },
        'Hard (60-79%)': { min: 0.6, max: 0.79 },
        'Very Hard (80-100%)': { min: 0.8, max: 1.0 },
      };
      let difficulty_min, difficulty_max;
      if (difficultyLabel && difficultyMap[difficultyLabel]) {
        difficulty_min = difficultyMap[difficultyLabel].min;
        difficulty_max = difficultyMap[difficultyLabel].max;
      }

      const baseParams = prune({
        event: EVENT_NAME,
        division,
        subtopic,
        question_type: questionType,
        difficulty_min,
        difficulty_max,
        limit: 1,
      });

      // Fetch (retry a few times if the API returns a disallowed subtopic by chance)
      let question = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const listRes = await axios.get(`${PRIMARY_BASE}/api/questions`, {
          params: baseParams,
          timeout: 15000,
          headers: AUTH_HEADERS,
        });
        if (!listRes.data?.success) {
          await interaction.editReply('API error. Please try again later.');
          return;
        }
        const first = pickFirstQuestion(listRes.data.data);
        if (!first) {
          await interaction.editReply('No questions found matching your criteria. Try different filters.');
          return;
        }
        // Optionally expand by ID to get images array if needed
        question = first;
        if (!first.base52 && first.id) {
          try {
            const detailRes = await axios.get(`${PRIMARY_BASE}/api/questions/${first.id}`, {
              timeout: 15000,
              headers: AUTH_HEADERS,
            });
            if (detailRes.data?.success && detailRes.data.data) {
              question = detailRes.data.data;
            }
          } catch {}
        }

        // Guard: make sure subtopic/division adhere to rules
        const qDiv = question.division || division;
        const qSubtopics = Array.isArray(question.subtopics) ? question.subtopics : [];
        const subtopicOk =
          !RULES.allowedSubtopics.length || qSubtopics.some((s) => RULES.allowedSubtopics.includes(s));
        const divOk = !RULES.divisions.length || RULES.divisions.includes(qDiv);
        if (subtopicOk && divOk) break; // good
        question = null; // try again
      }

      if (!question || !question.question) {
        await interaction.editReply('Question data is incomplete. Please try again.');
        return;
      }

      // Build embed + optional image attachments
      const embed = buildQuestionEmbed(question);
      const components = [buildButtonsRow(question.id || interaction.id)];

      // Attach multiple images as files (only if pictured row is green for this event)
      const files = [];
      if (RULES.allowImages) {
        if (Array.isArray(question.images) && question.images.length > 1) {
          // Already put images[0] in the embed; attach all images as files too
          for (let i = 0; i < question.images.length; i++) {
            const url = question.images[i];
            if (typeof url === 'string' && url.startsWith('http')) {
              const nameGuess = url.split('/').pop()?.split('?')[0] || `image_${i + 1}.jpg`;
              files.push({ attachment: url, name: nameGuess });
            }
          }
        } else if (question.imageData) {
          // Optional: also attach the single imageData as a file (not required)
          const url = question.imageData;
          const nameGuess = url.split('/').pop()?.split('?')[0] || 'image.jpg';
          files.push({ attachment: url, name: nameGuess });
        }
      }

      const sent = await interaction.editReply(
        files.length ? { embeds: [embed], components, files } : { embeds: [embed], components },
      );

      // Collector for buttons
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
                await submission.reply('This question has no options — cannot check as MCQ.');
                return;
              }
              const letter = (userAnswer[0] || '').toUpperCase();
              const idx = letter.charCodeAt(0) - 65;
              if (!(idx >= 0 && idx < options.length)) {
                await submission.reply(`Invalid choice. Please enter a letter between A and ${letterFromIndex(options.length - 1)}.`);
                return;
              }
              const correctIdx = resolveCorrectIndex(question);
              const correct = idx === correctIdx;

              const resultEmbed = new EmbedBuilder()
                .setColor(correct ? COLOR_GREEN : COLOR_RED)
                .setTitle(correct ? '✅ Correct!' : '❌ Wrong.')
                .addFields(
                  { name: 'Your answer', value: `**${letterFromIndex(idx)})** ${options[idx]}`, inline: true },
                  { name: 'Correct answer', value: `**${letterFromIndex(correctIdx)})** ${options[correctIdx]}`, inline: true },
                );

              await submission.reply({ embeds: [resultEmbed] });
            } else {
              // FRQ grading — no score/feedback shown; threshold > 50%
              try {
                const correctAnswers =
                  Array.isArray(question.answers)
                    ? question.answers.map((a) => String(a))
                    : typeof question.answers === 'string'
                      ? [question.answers]
                      : [];

                const requestBody = {
                  responses: [
                    {
                      question: question.question,
                      correctAnswers,
                      studentAnswer: userAnswer,
                    },
                  ],
                };

                const gradeRes = await axios.post(
                  `${PRIMARY_BASE}/api/gemini/grade-free-responses`,
                  requestBody,
                  { headers: AUTH_HEADERS },
                );

                const grade = gradeRes.data?.data?.grades?.[0];
                let score = null;
                if (grade && typeof grade.score === 'number') {
                  score = grade.score;
                } else if (gradeRes.data?.data?.scores?.[0] !== undefined) {
                  score = gradeRes.data.data.scores[0];
                } else {
                  await submission.reply('Grading service did not return a result. Please try again shortly.');
                  return;
                }

                const isCorrect = Math.round(score * 100) > 50;
                const correctAnswersDisplay =
                  correctAnswers && correctAnswers.length
                    ? (correctAnswers.join('; ').slice(0, 1000) + (correctAnswers.join('; ').length > 1000 ? '…' : ''))
                    : '—';

                const resultEmbed = new EmbedBuilder()
                  .setColor(isCorrect ? COLOR_GREEN : COLOR_RED)
                  .setTitle(isCorrect ? '✅ Correct!' : '❌ Wrong.')
                  .addFields(
                    { name: 'Your answer', value: userAnswer.slice(0, 1024) || '—', inline: false },
                    { name: 'Expected answer', value: correctAnswersDisplay || '—', inline: false },
                  );

                await submission.reply({ embeds: [resultEmbed] });
              } catch (err) {
                console.error('[astronomy] FRQ grading error:', err?.response?.status, err?.message);
                if (err?.response?.status === 429) {
                  await submission.reply('The grading service is rate-limited right now. Please try again in a moment.');
                } else if (err?.response?.status === 401 || err?.response?.status === 403) {
                  await submission.reply('Authentication failed for grading. Check your API key.');
                } else if (err?.response?.status) {
                  await submission.reply(`Grading failed: HTTP ${err.response.status} - ${err.response.statusText || 'Unknown error'}. Please try again shortly.`);
                } else {
                  await submission.reply(`Grading failed: ${err?.message || 'Network or connection error'}. Please try again shortly.`);
                }
              }
            }
          } else if (btn.customId === `explain_${question.id || interaction.id}`) {
            await btn.deferReply(); // public
            try {
              const explanation = await getExplanationWithRetry(question, EVENT_NAME, AUTH_HEADERS, 'astronomy');
              const finalExplanation = explanation || 'No explanation available.';

              const explainEmbed = new EmbedBuilder().setColor(COLOR_BLUE).setTitle('Explanation');

              if (finalExplanation.length <= 4096) {
                explainEmbed.setDescription(finalExplanation);
                await btn.editReply({ embeds: [explainEmbed] });
              } else {
                explainEmbed.setDescription('The full explanation is attached as a file below.');
                const buffer = Buffer.from(finalExplanation, 'utf-8');
                await btn.editReply({ embeds: [explainEmbed], files: [{ attachment: buffer, name: 'explanation.txt' }] });
              }
            } catch (err) {
              console.error('[astronomy] Explanation error:', err?.response?.status, err?.message);
              if (err?.response?.status === 429) {
                await btn.editReply('The explanation service is rate-limited right now. Please try again in a moment.');
              } else if (err?.response?.status === 401 || err?.response?.status === 403) {
                await btn.editReply('Authentication failed for explanation. Check your API key.');
              } else if (err?.response?.status) {
                await btn.editReply(`Could not fetch an explanation: HTTP ${err.response.status} - ${err.response.statusText || 'Unknown error'}. Please try again shortly.`);
              } else {
                await btn.editReply(`Could not fetch an explanation: ${err?.message || 'Network or connection error'}. Please try again shortly.`);
              }
            }
          }
        } catch (innerErr) {
          console.error('[astronomy] Button handler error:', innerErr);
          try {
            if (!btn.replied && !btn.deferred) {
              await btn.reply('Something went wrong handling that action.');
            }
          } catch {}
        }
      });

      collector.on('end', () => { /* stop after 30m; visuals remain */ });
    } catch (err) {
      console.error('Error in Astronomy command:', err);
      if (err.response?.status === 429) {
        await interaction.editReply('Rate limit exceeded. Please try again in a few moments.');
      } else {
        await interaction.editReply('Command failed. Please try again later.');
      }
    }
  }
};

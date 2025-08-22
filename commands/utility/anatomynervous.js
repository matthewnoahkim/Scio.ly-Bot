// /commands/anatomynervous.js
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
const { letterFromIndex, buildFullQuestionText, extractExplanation, getExplanationWithRetry } = require('../../shared-utils');

// ====== Config ======
const PRIMARY_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY;
if (!API_KEY) {
  console.warn('[anatomynervous] No SCIO_API_KEY found in environment variables. API calls may fail.');
}
const AUTH_HEADERS = API_KEY
  ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` }
  : {};

// Colors
const COLOR_BLUE = '#0000FF';
const COLOR_GREEN = '#008000';
const COLOR_RED = '#FF0000';

const questionTypeOptions = ["MCQ", "FRQ"];
const divisionOptions = ["Division B", "Division C"];
const difficultyOptions = [
  "Very Easy (0-19%)",
  "Easy (20-39%)", 
  "Medium (40-59%)",
  "Hard (60-79%)",
  "Very Hard (80-100%)"
];
const subtopicOptions = ["Brain", "Spinal Cord", "Nerves", "Reflexes", "Neurotransmitters"];

const difficultyMap = {
  "Very Easy (0-19%)": { min: 0.0, max: 0.19 },
  "Easy (20-39%)": { min: 0.2, max: 0.39 },
  "Medium (40-59%)": { min: 0.4, max: 0.59 },
  "Hard (60-79%)": { min: 0.6, max: 0.79 },
  "Very Hard (80-100%)": { min: 0.8, max: 1.0 }
};

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
  console.warn('[anatomynervous] Could not resolve correct index from answers:', answers);
  return 0;
}

function buildQuestionEmbed(question) {
  const embed = new EmbedBuilder()
    .setColor(COLOR_BLUE)
    .setTitle('Anatomy - Nervous')
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anatomynervous')
    .setDescription('Get an Anatomy - Nervous question')
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

      const baseParams = prune({
        event: 'Anatomy - Nervous',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType,
        limit: 1
      });

      const listRes = await axios.get(`${PRIMARY_BASE}/api/questions`, { params: baseParams, timeout: 15000 });
      if (!listRes.data?.success) {
        await interaction.editReply('API error. Please try again later.');
        return;
      }

      const first = pickFirstQuestion(listRes.data.data);
      if (!first) {
        await interaction.editReply('No questions found matching your criteria. Try different filters.');
        return;
      }

      let question = first;
      if (!first.base52 && first.id) {
        try {
          const detailRes = await axios.get(`${PRIMARY_BASE}/api/questions/${first.id}`, { timeout: 15000 });
          if (detailRes.data?.success && detailRes.data.data) {
            question = detailRes.data.data;
          }
        } catch {
          // ignore detail fetch fail; use first
        }
      }

      // Validate question data
      if (!question.question) {
        await interaction.editReply('Question data is incomplete. Please try again.');
        return;
      }
      
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
            // keep ephemeral to avoid channel spam
            await btn.reply({ content: 'Only the original requester can use these buttons.', ephemeral: true });
            return;
          }

          if (btn.customId === `check_${question.id || interaction.id}`) {
            const isMCQ = Array.isArray(question.options) && question.options.length > 0;
            const modalId = `check_modal_${sent.id}`;

            const modal = new ModalBuilder().setCustomId(modalId).setTitle('Check your answer');
            const input = new TextInputBuilder()
              .setCustomId('answer_input')
              .setLabel(isMCQ ? 'Your answer' : 'Your answer')
              .setStyle(isMCQ ? TextInputStyle.Short : TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder(isMCQ ? 'e.g., A' : 'Include all necessary details.');
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
              const correctLetter = letterFromIndex(correctIdx);
              const correctText = options[correctIdx];
              const userText = options[idx];
              const correct = idx === correctIdx;

              const resultEmbed = new EmbedBuilder()
                .setColor(correct ? COLOR_GREEN : COLOR_RED)
                .setTitle(correct ? '✅ Correct!' : '❌ Wrong.')
                .addFields(
                  { name: 'Your answer', value: `**${letter})** ${userText}`, inline: true },
                  { name: 'Correct answer', value: `**${correctLetter})** ${correctText}`, inline: true },
                );

              await submission.reply({ embeds: [resultEmbed] });
            } else {
              // FRQ grading
              try {
                const correctAnswers =
                  Array.isArray(question.answers)
                    ? question.answers.map(a => String(a))
                    : (typeof question.answers === 'string' ? [question.answers] : []);
                
                const requestBody = {
                  responses: [{ 
                    question: question.question, 
                    correctAnswers, 
                    studentAnswer: userAnswer
                  }]
                };

                const gradeRes = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, requestBody, { headers: AUTH_HEADERS });

                const grade = gradeRes.data?.data?.grades?.[0];
                let score = null;
                let feedback = 'No detailed feedback available from the grading service.';
                let keyPoints = [];
                let suggestions = [];
                
                if (grade) {
                  score = grade.score;
                  feedback = grade.feedback || 'No feedback provided.';
                  keyPoints = Array.isArray(grade.keyPoints) ? grade.keyPoints : [];
                  suggestions = Array.isArray(grade.suggestions) ? grade.suggestions : [];
                } else if (gradeRes.data?.data?.scores?.[0] !== undefined) {
                  score = gradeRes.data.data.scores[0];
                  if (score >= 0.8) feedback = 'Excellent answer! You covered the key points well.';
                  else if (score >= 0.6) feedback = 'Good answer! You covered most of the key points.';
                  else if (score >= 0.4) feedback = 'Fair answer. You covered some key points but could improve.';
                  else feedback = 'The answer could be improved. Review the key concepts and try again.';
                } else {
                  await submission.reply('Grading service did not return a result. Please try again shortly.');
                  return;
                }
                
                const scorePct = typeof score === 'number' ? Math.round(score * 100) : null;
                const isCorrectByThreshold = (scorePct ?? 0) > 40;
                const correctAnswersDisplay = (correctAnswers && correctAnswers.length)
                  ? (correctAnswers.join('; ').slice(0, 1000) + (correctAnswers.join('; ').length > 1000 ? '…' : ''))
                  : '—';

                const resultEmbed = new EmbedBuilder()
                  .setColor(isCorrectByThreshold ? COLOR_GREEN : COLOR_RED)
                  .setTitle(isCorrectByThreshold ? '✅ Correct!' : '❌ Wrong')
                  .addFields(
                    ...(scorePct !== null ? [{ name: 'Score', value: `${scorePct}%`, inline: true }] : []),
                    { name: 'Your answer', value: userAnswer.slice(0, 1024) || '—', inline: false },
                    { name: 'Expected key points / answers', value: correctAnswersDisplay || '—', inline: false },
                    { name: 'Feedback', value: feedback.slice(0, 1024) || '—', inline: false },
                  );

                if (keyPoints.length > 0) {
                  const kp = keyPoints.map(p => `• ${p}`).join('\n').slice(0, 1024);
                  if (kp) resultEmbed.addFields({ name: 'Key Points Covered', value: kp, inline: false });
                }
                if (suggestions.length > 0) {
                  const sg = suggestions.map(s => `• ${s}`).join('\n').slice(0, 1024);
                  if (sg) resultEmbed.addFields({ name: 'Suggestions', value: sg, inline: false });
                }
                
                await submission.reply({ embeds: [resultEmbed] });
              } catch (err) {
                console.error('[anatomynervous] FRQ grading error:', err?.response?.status, err?.message);
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
              const explanation = await getExplanationWithRetry(question, 'Anatomy - Nervous', AUTH_HEADERS, 'anatomynervous');
              const finalExplanation = explanation || 'No explanation available.';

              const explainEmbed = new EmbedBuilder()
                .setColor(COLOR_BLUE)
                .setTitle('Explanation');

              if (finalExplanation.length <= 4096) {
                explainEmbed.setDescription(finalExplanation);
                await btn.editReply({ embeds: [explainEmbed] });
              } else {
                explainEmbed.setDescription('The full explanation is attached as a file below.');
                const buffer = Buffer.from(finalExplanation, 'utf-8');
                await btn.editReply({ embeds: [explainEmbed], files: [{ attachment: buffer, name: 'explanation.txt' }] });
              }
            } catch (err) {
              console.error('[anatomynervous] Explanation error:', err?.response?.status, err?.message);
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
          console.error('[anatomynervous] Button handler error:', innerErr);
          try {
            if (!btn.replied && !btn.deferred) {
              await btn.reply('Something went wrong handling that action.');
            }
          } catch {}
        }
      });

      collector.on('end', () => { /* buttons stop after 30m; visuals remain */ });

    } catch (err) {
      console.error('Error in Anatomy - Nervous command:', err);
      if (err.response?.status === 429) {
        await interaction.editReply('Rate limit exceeded. Please try again in a few moments.');
      } else {
        await interaction.editReply('Command failed. Please try again later.');
      }
    }
  }
};

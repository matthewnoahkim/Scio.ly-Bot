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

const questionTypeOptions = ["MCQ", "FRQ"];
const divisionOptions = ["Division C"];
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
    .setColor(0x0099ff)
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
    .setDescription('Get a Anatomy - Nervous question')
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
        await interaction.editReply({ content: 'API error. Please try again later.' });
        return;
      }

      const first = pickFirstQuestion(listRes.data.data);
      if (!first) {
        await interaction.editReply({ content: 'No questions found matching your criteria. Try different filters.' });
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
        }
      }

      // Validate question data
      if (!question.question) {
        await interaction.editReply({ content: 'Question data is incomplete. Please try again.' });
        return;
      }
      
      console.log('[anatomynervous] Question loaded:', {
        id: question.id,
        hasOptions: Array.isArray(question.options) && question.options.length > 0,
        hasAnswers: Array.isArray(question.answers) && question.answers.length > 0,
        questionType: Array.isArray(question.options) && question.options.length > 0 ? 'MCQ' : 'FRQ'
      });
      
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
            // Keep this ephemeral to avoid channel spam from non-requesters
            await btn.reply({ content: 'Only the original requester can use these buttons.', ephemeral: true });
            return;
          }

          if (btn.customId === `check_${question.id || interaction.id}`) {
            const isMCQ = Array.isArray(question.options) && question.options.length > 0;
            const modalId = `check_modal_${sent.id}`;
            
            console.log('[anatomynervous] Check button clicked:', {
              isMCQ,
              hasOptions: Array.isArray(question.options) && question.options.length > 0,
              optionsCount: question.options?.length || 0
            });

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
                const errorEmbed = new EmbedBuilder()
                  .setColor(0xff5555)
                  .setTitle('🧪 Answer Check')
                  .setDescription('This question has no options — cannot check as MCQ.');
                await submission.reply({ embeds: [errorEmbed] });
                return;
              }
              const letter = (userAnswer[0] || '').toUpperCase();
              const idx = letter.charCodeAt(0) - 65;
              if (!(idx >= 0 && idx < options.length)) {
                const invalidEmbed = new EmbedBuilder()
                  .setColor(0xffaa00)
                  .setTitle('🧪 Answer Check')
                  .setDescription(`Invalid choice. Please enter a letter between **A** and **${letterFromIndex(options.length - 1)}**.`);
                await submission.reply({ embeds: [invalidEmbed] });
                return;
              }
              const correctIdx = resolveCorrectIndex(question);
              const correctLetter = letterFromIndex(correctIdx);
              const correctText = options[correctIdx];
              const userText = options[idx];

              const correct = idx === correctIdx;

              const resultEmbed = new EmbedBuilder()
                .setColor(correct ? 0x3fbf7f : 0xff5555)
                .setTitle('🧪 Answer Check')
                .addFields(
                  { name: 'Your answer', value: `**${letter})** ${userText}`, inline: true },
                  { name: 'Correct answer', value: `**${correctLetter})** ${correctText}`, inline: true },
                )
                .setFooter({ text: correct ? 'Nice job!' : 'Keep practicing — you’ve got this.' });

              await submission.reply({ embeds: [resultEmbed] });
            } else {
              // FRQ grading
              try {
                console.log('[anatomynervous] Starting FRQ grading for:', {
                  questionText: question.question?.substring(0, 100) + '...',
                  userAnswer: userAnswer.substring(0, 100) + '...',
                  correctAnswers: question.answers
                });
                
                const correctAnswers =
                  Array.isArray(question.answers)
                    ? question.answers.map(a => String(a))
                    : (typeof question.answers === 'string' ? [question.answers] : []);
                
                console.log('[anatomynervous] Prepared grading request:', {
                  questionLength: question.question?.length,
                  userAnswerLength: userAnswer.length,
                  correctAnswersCount: correctAnswers.length,
                  correctAnswers: correctAnswers
                });
                
                // Single primary API only (fallback removed)
                const requestBody = {
                  responses: [{ 
                    question: question.question, 
                    correctAnswers, 
                    studentAnswer: userAnswer
                  }]
                };
                console.log('[anatomynervous] Request body:', JSON.stringify(requestBody, null, 2));

                let gradeRes;
                console.log('[anatomynervous] Trying primary grading API...');
                gradeRes = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, requestBody, { headers: AUTH_HEADERS });

                console.log('[anatomynervous] Grading API response received:', {
                  hasData: !!gradeRes.data?.data,
                  dataKeys: gradeRes.data?.data ? Object.keys(gradeRes.data.data) : 'none',
                  fullResponse: JSON.stringify(gradeRes.data, null, 2)
                });
                
                // Handle the grading API response format
                const grade = gradeRes.data?.data?.grades?.[0];
                let score = null;
                let feedback = 'No detailed feedback available from the grading service.';
                let keyPoints = [];
                let suggestions = [];
                
                if (grade) {
                  // Full grade object with feedback
                  score = grade.score;
                  feedback = grade.feedback || 'No feedback provided.';
                  keyPoints = Array.isArray(grade.keyPoints) ? grade.keyPoints : [];
                  suggestions = Array.isArray(grade.suggestions) ? grade.suggestions : [];
                } else if (gradeRes.data?.data?.scores?.[0] !== undefined) {
                  // Scores-only format
                  score = gradeRes.data.data.scores[0];
                  if (score >= 0.8) {
                    feedback = 'Excellent answer! You covered the key points well.';
                  } else if (score >= 0.6) {
                    feedback = 'Good answer! You covered most of the key points.';
                  } else if (score >= 0.4) {
                    feedback = 'Fair answer. You covered some key points but could improve.';
                  } else {
                    feedback = 'The answer could be improved. Review the key concepts and try again.';
                  }
                } else {
                  console.log('[anatomynervous] No score or grade found in response, showing error to user');
                  const errorEmbed = new EmbedBuilder()
                    .setColor(0xff5555)
                    .setTitle('🧠 Grading Result')
                    .setDescription('Grading service did not return a result. Please try again shortly.');
                  await submission.reply({ embeds: [errorEmbed] });
                  return;
                }
                
                const scorePct = typeof score === 'number' ? Math.round(score * 100) : null;
                const correctAnswersDisplay = (correctAnswers && correctAnswers.length)
                  ? (correctAnswers.join('; ').slice(0, 1000) + (correctAnswers.join('; ').length > 1000 ? '…' : ''))
                  : '—';

                const resultEmbed = new EmbedBuilder()
                  .setColor(0x5865f2)
                  .setTitle('🧠 Grading Result')
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
                console.error('[anatomynervous] FRQ grading error details:', {
                  status: err?.response?.status,
                  statusText: err?.response?.statusText,
                  message: err?.message,
                  data: err?.response?.data,
                  fullError: err
                });

                const errEmbed = new EmbedBuilder().setTitle('🧠 Grading Error');

                if (err?.response?.status === 429) {
                  errEmbed.setColor(0xffaa00).setDescription('⏳ The grading service is rate-limited right now. Please try again in a moment.');
                } else if (err?.response?.status === 401 || err?.response?.status === 403) {
                  errEmbed.setColor(0xff5555).setDescription('🔒 Authentication failed for grading. Check your API key.');
                } else if (err?.response?.status) {
                  errEmbed
                    .setColor(0xff5555)
                    .setDescription(`Grading failed: HTTP ${err.response.status} - ${err.response.statusText || 'Unknown error'}. Please try again shortly.`);
                } else {
                  errEmbed
                    .setColor(0xff5555)
                    .setDescription(`Grading failed: ${err?.message || 'Network or connection error'}. Please try again shortly.`);
                }

                await submission.reply({ embeds: [errEmbed] });
              }
            }
          } else if (btn.customId === `explain_${question.id || interaction.id}`) {
            await btn.deferReply(); // public, not ephemeral
            try {
              const explanation = await getExplanationWithRetry(question, 'Anatomy - Nervous', AUTH_HEADERS, 'anatomynervous');
              const finalExplanation = explanation || 'No explanation available.';

              const explainEmbed = new EmbedBuilder()
                .setColor(0x2b90d9)
                .setTitle('📘 Explanation');

              // If within embed limit, send as a single embed
              if (finalExplanation.length <= 4096) {
                explainEmbed.setDescription(finalExplanation);
                await btn.editReply({ embeds: [explainEmbed] });
              } else {
                // Include a short note in the embed and attach full text so nothing is lost
                explainEmbed.setDescription('The full explanation is attached as a file below.');
                const buffer = Buffer.from(finalExplanation, 'utf-8');
                await btn.editReply({ embeds: [explainEmbed], files: [{ attachment: buffer, name: 'explanation.txt' }] });
              }
            } catch (err) {
              console.error('[anatomynervous] Explanation error details:', {
                status: err?.response?.status,
                statusText: err?.response?.statusText,
                message: err?.message,
                data: err?.response?.data,
                fullError: err
              });

              const errEmbed = new EmbedBuilder().setTitle('📘 Explanation Error');

              if (err?.response?.status === 429) {
                errEmbed.setColor(0xffaa00).setDescription('⏳ The explanation service is rate-limited right now. Please try again in a moment.');
              } else if (err?.response?.status === 401 || err?.response?.status === 403) {
                errEmbed.setColor(0xff5555).setDescription('🔒 Authentication failed for explanation. Check your API key.');
              } else if (err?.response?.status) {
                errEmbed
                  .setColor(0xff5555)
                  .setDescription(`Could not fetch an explanation: HTTP ${err.response.status} - ${err.response.statusText || 'Unknown error'}. Please try again shortly.`);
              } else {
                errEmbed
                  .setColor(0xff5555)
                  .setDescription(`Could not fetch an explanation: ${err?.message || 'Network or connection error'}. Please try again shortly.`);
              }

              await btn.editReply({ embeds: [errEmbed] });
            }
          }
        } catch (innerErr) {
          console.error('[anatomynervous] Button handler error:', innerErr);
          try {
            if (!btn.replied && !btn.deferred) {
              const errEmbed = new EmbedBuilder()
                .setColor(0xff5555)
                .setTitle('Action Error')
                .setDescription('Something went wrong handling that action.');
              await btn.reply({ embeds: [errEmbed] });
            }
          } catch {}
        }
      });

      collector.on('end', () => { /* buttons stop being handled after 30m; visuals remain */ });

    } catch (err) {
      console.error('Error in Anatomy - Nervous command:', err);

      if (err.response?.status === 429) {
        await interaction.editReply({ content: 'Rate limit exceeded. Please try again in a few moments.' });
      } else {
        await interaction.editReply({ content: 'Command failed. Please try again later.' });
      }
    }
  }
};

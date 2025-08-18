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
  MessageFlags,
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
  "Easy (20-39%)":    { min: 0.2, max: 0.39 },
  "Medium (40-59%)":  { min: 0.4, max: 0.59 },
  "Hard (60-79%)":    { min: 0.6, max: 0.79 },
  "Very Hard (80-100%)": { min: 0.8, max: 1.0 }
};

// ---- Helpers ----
const BASE_URL = 'https://scio.ly';

function letterFromIndex(i) {
  return String.fromCharCode(65 + i);
}

function normalize(str) {
  return String(str).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Attempts to compute the correct MCQ option index from the question payload.
 * Supports several possible forms (index, 1-based index, letter, or option text).
 * Returns { index, letter, text } or null if undetermined.
 */
function resolveCorrectMcq(question) {
  if (!question || !Array.isArray(question.options) || question.options.length === 0) return null;
  const opts = question.options;
  const answers = question.answers;

  // Prefer first answer if multiple are present (typical MCQ)
  let a = Array.isArray(answers) && answers.length ? answers[0] : answers;

  // If number (0-based or 1-based)
  if (typeof a === 'number' && Number.isInteger(a)) {
    let idx = (a >= 0 && a < opts.length) ? a : (a >= 1 && a <= opts.length ? a - 1 : -1);
    if (idx >= 0) return { index: idx, letter: letterFromIndex(idx), text: opts[idx] };
  }

  // If letter like 'A'
  if (typeof a === 'string' && a.length === 1 && /[A-Za-z]/.test(a)) {
    const idx = a.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < opts.length) return { index: idx, letter: letterFromIndex(idx), text: opts[idx] };
  }

  // If text matching an option
  if (typeof a === 'string' && a.length > 1) {
    const n = normalize(a);
    const idx = opts.findIndex(o => normalize(o) === n);
    if (idx !== -1) return { index: idx, letter: letterFromIndex(idx), text: opts[idx] };
  }

  // If answers is an array of strings and one matches an option
  if (Array.isArray(answers)) {
    for (const cand of answers) {
      if (typeof cand === 'string') {
        const n = normalize(cand);
        const idx = opts.findIndex(o => normalize(o) === n);
        if (idx !== -1) return { index: idx, letter: letterFromIndex(idx), text: opts[idx] };
      }
    }
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anatomyendocrine')
    .setDescription('Get an Anatomy - Endocrine question')
    .addStringOption(option =>
      option.setName('question_type')
        .setDescription('Question type (leave blank for random)')
        .setRequired(false)
        .addChoices(...questionTypeOptions.map(q => ({ name: q, value: q.toLowerCase() })))
    )
    .addStringOption(option =>
      option.setName('division')
        .setDescription('Division (leave blank for random)')
        .setRequired(false)
        .addChoices(...divisionOptions.map(d => ({ name: d, value: d.split(' ')[1] })))
    )
    .addStringOption(option =>
      option.setName('difficulty')
        .setDescription('Difficulty (leave blank for random)')
        .setRequired(false)
        .addChoices(...difficultyOptions.map(d => ({ name: d, value: d })))
    )
    .addStringOption(option =>
      option.setName('subtopic')
        .setDescription('Subtopic (leave blank for random)')
        .setRequired(false)
        .addChoices(...subtopicOptions.map(s => ({ name: s, value: s })))
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply(); // public reply

      const questionType = interaction.options.getString('question_type'); // 'mcq' | 'frq' | null
      const division = interaction.options.getString('division'); // 'B' | 'C' | null
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
        question_type: questionType, // expects 'mcq' or 'frq'
        limit: 1
      };

      const res = await axios.get(`${BASE_URL}/api/questions`, { params: query });

      if (!res.data?.success || !res.data?.data || res.data.data.length === 0) {
        await interaction.editReply({
          content: 'No questions found matching your criteria. Try different filters.'
        });
        return;
      }

      const question = res.data.data[0];
      const isMcq = Array.isArray(question.options) && question.options.length > 0;

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Anatomy - Endocrine')
        .setDescription(question.question || 'Question text unavailable');

      const fields = [];

      if (isMcq) {
        const answerChoices = question.options
          .map((opt, i) => `${letterFromIndex(i)}) ${opt}`)
          .join('\n');
        fields.push({ name: 'Answer Choices', value: answerChoices, inline: false });
      }

      const pct = (typeof question.difficulty === 'number' && !Number.isNaN(question.difficulty))
        ? `${Math.round(question.difficulty * 100)}%`
        : 'N/A';

      fields.push(
        { name: 'Division', value: question.division || division || 'N/A', inline: true },
        { name: 'Difficulty', value: pct, inline: true },
        { name: 'Subtopic(s)', value: (Array.isArray(question.subtopics) && question.subtopics.length)
            ? question.subtopics.join(', ')
            : (subtopic || 'None'),
          inline: true
        }
      );

      embed.addFields(fields);
      embed.setFooter({ text: 'Use the buttons below.' });

      // Buttons (with a per-message nonce so we can distinguish multiple instances)
      const nonce = crypto.randomBytes(4).toString('hex');
      const CHECK_ID = `ae_check_${nonce}`;
      const EXPLAIN_ID = `ae_explain_${nonce}`;
      const modalId = `ae_modal_${nonce}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CHECK_ID)
          .setLabel('Check answer')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(EXPLAIN_ID)
          .setLabel('Explain question')
          .setStyle(ButtonStyle.Primary)
      );

      const sent = await interaction.editReply({ embeds: [embed], components: [row] });

      // Collector for this message so we don't need a global InteractionCreate handler for buttons
      const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 24 * 60 * 60 * 1000, // 24h; allows pressing any number of times within this window
      });

      collector.on('collect', async (btnInt) => {
        try {
          // Only proceed for clicks on this message
          if (btnInt.message.id !== sent.id) return;

          // ---- CHECK ANSWER FLOW ----
          if (btnInt.customId === CHECK_ID) {
            // Build modal
            const modal = new ModalBuilder()
              .setCustomId(modalId)
              .setTitle('Check Your Answer');

            const input = new TextInputBuilder()
              .setCustomId('answerInput')
              .setLabel(isMcq
                ? 'Enter your answer letter (A, B, C, ...)'
                : 'Enter your free-response answer')
              .setPlaceholder(isMcq ? 'e.g., B' : 'Type your answer here')
              .setStyle(isMcq ? TextInputStyle.Short : TextInputStyle.Paragraph)
              .setRequired(true);

            const modalRow = new ActionRowBuilder().addComponents(input);
            modal.addComponents(modalRow);

            await btnInt.showModal(modal);

            // Wait for the user's modal submit
            const submitted = await btnInt.awaitModalSubmit({
              time: 5 * 60 * 1000, // 5 minutes to submit
              filter: (i) => i.customId === modalId && i.user.id === btnInt.user.id
            });

            const userAnswerRaw = submitted.fields.getTextInputValue('answerInput') || '';
            const userAnswer = userAnswerRaw.trim();

            if (isMcq) {
              // Grade MCQ by letter
              const correct = resolveCorrectMcq(question);
              if (!correct) {
                await submitted.reply({
                  content: 'Sorry, I could not determine the correct answer for this question.',
                  flags: MessageFlags.Ephemeral
                });
                return;
              }

              const userLetter = userAnswer.slice(0, 1).toUpperCase();
              const isCorrect = userLetter === correct.letter;

              await submitted.reply({
                content: `${isCorrect ? '✅ Correct!' : '❌ Incorrect.'}\n**Your answer:** ${userLetter}\n**Correct answer:** ${correct.letter}) ${correct.text}`,
                flags: MessageFlags.Ephemeral
              });
            } else {
              // Grade FRQ using API
              try {
                const body = {
                  freeResponses: [{
                    question, // send the whole question object for context
                    correctAnswers: Array.isArray(question.answers) ? question.answers : (question.answers ? [question.answers] : []),
                    studentAnswer: userAnswer
                  }]
                };

                const gradeRes = await axios.post(`${BASE_URL}/api/gemini/grade-free-responses`, body, {
                  headers: { 'Content-Type': 'application/json' }
                });

                const payload = gradeRes.data?.data;
                const result = Array.isArray(payload) ? payload[0] : (payload?.result || payload);

                const isCorrect =
                  (typeof result?.isCorrect === 'boolean' && result.isCorrect) ||
                  (typeof result?.correct === 'boolean' && result.correct) ||
                  (typeof result?.score === 'number' ? result.score >= 0.5 : false);

                const correctAnswers = Array.isArray(question.answers) ? question.answers
                  : (question.answers ? [question.answers] : []);

                const correctLine = correctAnswers.length
                  ? correctAnswers.join(' | ')
                  : 'N/A';

                await submitted.reply({
                  content: `${isCorrect ? '✅ Likely correct!' : '❌ Likely incorrect.'}\n**Your answer:** ${userAnswer}\n**Expected answer(s):** ${correctLine}`,
                  flags: MessageFlags.Ephemeral
                });
              } catch (err) {
                console.error('FRQ grading error:', err?.response?.data || err);
                const msg = err?.response?.status === 429
                  ? 'Rate limit exceeded. Please try again in a few moments.'
                  : 'Grading failed. Please try again later.';
                await submitted.reply({ content: msg, flags: MessageFlags.Ephemeral });
              }
            }
            return;
          }

          // ---- EXPLAIN QUESTION FLOW ----
          if (btnInt.customId === EXPLAIN_ID) {
            await btnInt.deferReply({ ephemeral: true });
            try {
              const explainRes = await axios.post(
                `${BASE_URL}/api/gemini/explain`,
                { question, event: 'Anatomy - Endocrine' },
                { headers: { 'Content-Type': 'application/json' } }
              );

              // Explanation could be in different shapes; try common ones
              const d = explainRes.data?.data;
              const expl = d?.explanation || d?.text || d?.message || (typeof d === 'string' ? d : null);

              await btnInt.editReply({
                content: expl || 'No explanation available for this question right now.'
              });
            } catch (err) {
              console.error('Explain error:', err?.response?.data || err);
              const msg = err?.response?.status === 429
                ? 'Rate limit exceeded. Please try again in a few moments.'
                : 'Failed to generate an explanation. Please try again later.';
              await btnInt.editReply({ content: msg });
            }
            return;
          }
        } catch (err) {
          // Defensive catch to avoid unhandled rejections
          console.error('Button/modal handling error:', err);
          try {
            if (!btnInt.replied && !btnInt.deferred) {
              await btnInt.reply({ content: 'Something went wrong handling that action.', flags: MessageFlags.Ephemeral });
            }
          } catch {}
        }
      });

      collector.on('end', () => {
        // No action needed; buttons will remain but won’t respond after collector stops.
      });

    } catch (err) {
      console.error('Error in Anatomy Endocrine command:', err?.response?.data || err);
      if (err?.response?.status === 429) {
        await interaction.editReply({ content: 'Rate limit exceeded. Please try again in a few moments.' });
      } else {
        await interaction.editReply({ content: 'Command failed. Please try again later.' });
      }
    }
  }
};

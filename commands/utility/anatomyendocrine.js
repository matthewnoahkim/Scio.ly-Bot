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
const crypto = require('crypto');

// =========================
// Config / Constants
// =========================
const BASE_URL = 'https://scio.ly';
const API_KEY = 'xo9IKNJG65e0LMBa55Tq';

// Create a pre-configured axios instance with auth headers
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 20_000,
});

// =========================
// Options UI
// =========================
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

// =========================
// Helpers
// =========================
const letterFromIndex = (i) => String.fromCharCode(65 + i);
const normalize = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Get MCQ answer in {index, letter, text} form, if possible */
function resolveCorrectMcq(question) {
  if (!question || !Array.isArray(question.options) || question.options.length === 0) return null;
  const opts = question.options;
  const answers = question.answers;

  let a = Array.isArray(answers) && answers.length ? answers[0] : answers;

  // numeric index (0- or 1-based)
  if (Number.isInteger(a)) {
    let idx = (a >= 0 && a < opts.length) ? a : (a >= 1 && a <= opts.length ? a - 1 : -1);
    if (idx >= 0) return { index: idx, letter: letterFromIndex(idx), text: opts[idx] };
  }

  // letter
  if (typeof a === 'string' && /^[A-Za-z]$/.test(a)) {
    const idx = a.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < opts.length) return { index: idx, letter: letterFromIndex(idx), text: opts[idx] };
  }

  // exact text match
  if (typeof a === 'string' && a.length > 1) {
    const n = normalize(a);
    const idx = opts.findIndex(o => normalize(o) === n);
    if (idx !== -1) return { index: idx, letter: letterFromIndex(idx), text: opts[idx] };
  }

  // any matching text in array
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

// =========================
// Command
// =========================
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
    // Ack ASAP to avoid 10062 timing issues
    let placeholderMsg;
    try {
      placeholderMsg = await interaction.reply({ content: 'Fetching question…', fetchReply: true });
    } catch {
      try { await interaction.deferReply(); } catch {}
    }

    try {
      const questionType = interaction.options.getString('question_type'); // 'mcq' | 'frq' | null
      const division = interaction.options.getString('division'); // 'B' | 'C' | null
      const difficultyLabel = interaction.options.getString('difficulty');
      const subtopic = interaction.options.getString('subtopic');

      let difficulty_min, difficulty_max;
      if (difficultyLabel && difficultyMap[difficultyLabel]) {
        difficulty_min = difficultyMap[difficultyLabel].min;
        difficulty_max = difficultyMap[difficultyLabel].max;
      }

      const params = {
        event: 'Anatomy - Endocrine',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType, // expects 'mcq' or 'frq'
        limit: 1
      };

      const res = await api.get('/api/questions', { params });

      if (!res.data?.success || !res.data?.data || res.data.data.length === 0) {
        const msg = 'No questions found matching your criteria. Try different filters.';
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: msg, embeds: [], components: [] });
        } else {
          await interaction.reply({ content: msg, ephemeral: true });
        }
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

      // Unique IDs to scope the buttons & modal to this message
      const nonce = crypto.randomBytes(4).toString('hex');
      const CHECK_ID = `ae_check_${nonce}`;
      const EXPLAIN_ID = `ae_explain_${nonce}`;
      const MODAL_ID = `ae_modal_${nonce}`;

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

      // Show the embed (edit the placeholder)
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '', embeds: [embed], components: [row] });
      } else {
        await interaction.reply({ embeds: [embed], components: [row] });
      }

      // Get the actual message and start a collector
      const message = placeholderMsg ?? await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 24 * 60 * 60 * 1000, // 24h window; buttons can be pressed any number of times
      });

      collector.on('collect', async (btnInt) => {
        try {
          if (btnInt.customId === CHECK_ID) {
            // Show modal for the user to enter answer
            const modal = new ModalBuilder()
              .setCustomId(MODAL_ID)
              .setTitle('Check Your Answer');

            const input = new TextInputBuilder()
              .setCustomId('answerInput')
              .setLabel(isMcq ? 'Enter your answer letter (A, B, C, ...)' : 'Enter your free-response answer')
              .setPlaceholder(isMcq ? 'e.g., B' : 'Type your answer here')
              .setStyle(isMcq ? TextInputStyle.Short : TextInputStyle.Paragraph)
              .setRequired(true);

            const modalRow = new ActionRowBuilder().addComponents(input);
            modal.addComponents(modalRow);
            await btnInt.showModal(modal);

            // One-shot modal listener bound to this user & customId
            const client = btnInt.client;
            const userId = btnInt.user.id;

            const onModal = async (i) => {
              if (!i.isModalSubmit()) return;
              if (i.customId !== MODAL_ID) return;
              if (i.user.id !== userId) return;

              try {
                const userAnswerRaw = i.fields.getTextInputValue('answerInput') || '';
                const userAnswer = userAnswerRaw.trim();

                if (isMcq) {
                  const correct = resolveCorrectMcq(question);
                  if (!correct) {
                    await i.reply({ content: 'Sorry, I could not determine the correct answer for this question.', ephemeral: true });
                    return;
                  }
                  const userLetter = userAnswer.slice(0, 1).toUpperCase();
                  const isCorrect = userLetter === correct.letter;

                  await i.reply({
                    content: `${isCorrect ? '✅ Correct!' : '❌ Incorrect.'}\n**Your answer:** ${userLetter}\n**Correct answer:** ${correct.letter}) ${correct.text}`,
                    ephemeral: true
                  });
                } else {
                  // FRQ grading via API with retry/backoff
                  try {
                    const body = {
                      freeResponses: [{
                        question,
                        correctAnswers: Array.isArray(question.answers) ? question.answers : (question.answers ? [question.answers] : []),
                        studentAnswer: userAnswer
                      }]
                    };
                    const gradeRes = await postWithRetry('/api/gemini/grade-free-responses', body);

                    // NOTE: adjust if your API returns a different structure
                    const payload = gradeRes.data?.data;
                    const result = Array.isArray(payload) ? payload[0] : (payload?.result || payload);
                    const isCorrect =
                      (typeof result?.isCorrect === 'boolean' && result.isCorrect) ||
                      (typeof result?.correct === 'boolean' && result.correct) ||
                      (typeof result?.score === 'number' ? result.score >= 0.5 : false);

                    const correctAnswers = Array.isArray(question.answers) ? question.answers
                      : (question.answers ? [question.answers] : []);
                    const correctLine = correctAnswers.length ? correctAnswers.join(' | ') : 'N/A';

                    await i.reply({
                      content: `${isCorrect ? '✅ Likely correct!' : '❌ Likely incorrect.'}\n**Your answer:** ${userAnswer}\n**Expected answer(s):** ${correctLine}`,
                      ephemeral: true
                    });
                  } catch (err) {
                    const status = err?.response?.status;
                    const msg =
                      status === 429 ? 'Rate limit exceeded. Please try again in a few moments.'
                      : status === 503 ? 'AI service temporarily unavailable. Please try again later.'
                      : 'Grading failed. Please try again later.';
                    await i.reply({ content: msg, ephemeral: true });
                  }
                }
              } finally {
                // Clean up this one-shot listener
                client.off('interactionCreate', onModal);
              }
            };

            // Arm the listener with a timeout
            btnInt.client.on('interactionCreate', onModal);
            setTimeout(() => btnInt.client.off('interactionCreate', onModal), 5 * 60 * 1000);

            return;
          }

          if (btnInt.customId === EXPLAIN_ID) {
            await btnInt.deferReply({ ephemeral: true });
            try {
              // Per your request: send only { question } to explain
              const explainRes = await postWithRetry('/api/gemini/explain', { question });

              // Try common shapes; tweak if your API returns a different field
              const d = explainRes.data?.data;
              const expl = d?.explanation || d?.text || d?.message || (typeof d === 'string' ? d : null);

              await btnInt.editReply({
                content: expl || 'No explanation available for this question right now.'
              });
            } catch (err) {
              const status = err?.response?.status;
              const msg =
                status === 429 ? 'Rate limit exceeded. Please try again in a few moments.'
                : status === 503 ? 'AI service temporarily unavailable. Please try again later.'
                : 'Failed to generate an explanation. Please try again later.';
              await btnInt.editReply({ content: msg });
            }
            return;
          }

        } catch (err) {
          try {
            if (!btnInt.deferred && !btnInt.replied) {
              await btnInt.reply({ content: 'Something went wrong handling that action.', ephemeral: true });
            }
          } catch {}
          console.error('Button/modal handling error:', err);
        }
      });

      collector.on('end', () => {
        // Buttons remain visible; they just won’t respond after 24h.
      });

    } catch (err) {
      console.error('Error in Anatomy Endocrine command:', err?.response?.data || err);
      const status = err?.response?.status;
      const msg =
        status === 429 ? 'Rate limit exceeded. Please try again in a few moments.'
        : status === 503 ? 'Service temporarily unavailable. Please try again later.'
        : 'Command failed. Please try again later.';

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: msg, embeds: [], components: [] });
        } else {
          await interaction.reply({ content: msg, ephemeral: true });
        }
      } catch {}
    }
  }
};

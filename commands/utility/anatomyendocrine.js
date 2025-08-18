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
  ComponentType
} = require('discord.js');
const axios = require('axios');

const API_BASE = 'https://scio.ly';

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

// Utility: derive correct MCQ index+letter from question.answers and question.options
function getCorrectMcqIndex(question) {
  const opts = question.options || [];
  const answers = Array.isArray(question.answers) ? question.answers : (question.answers ? [question.answers] : []);
  if (answers.length === 0 || opts.length === 0) return { index: null, letter: null };

  const first = answers[0];

  // If it's a number: could be 0-based or 1-based
  if (typeof first === 'number') {
    if (first >= 0 && first < opts.length) return { index: first, letter: String.fromCharCode(65 + first) };
    if (first >= 1 && first <= opts.length) return { index: first - 1, letter: String.fromCharCode(64 + first) };
  }

  if (typeof first === 'string') {
    const s = first.trim();
    // Looks like a letter?
    if (/^[A-Za-z]$/.test(s)) {
      const idx = s.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < opts.length) return { index: idx, letter: s.toUpperCase() };
    }
    // Otherwise try to match option text
    const normalized = s.toLowerCase();
    const idx2 = opts.findIndex(o => String(o).trim().toLowerCase() === normalized);
    if (idx2 !== -1) return { index: idx2, letter: String.fromCharCode(65 + idx2) };
  }

  // Fallback: not determinable
  return { index: null, letter: null };
}

// Utility: normalize user's MCQ answer to a letter
function normalizeUserMcqLetter(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return null;
  // If they typed like "A" or "a" or "choice A"
  const letterMatch = trimmed.match(/[A-Za-z]/);
  if (!letterMatch) return null;
  return letterMatch[0].toUpperCase();
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
      await interaction.deferReply();

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
        question_type: questionType, // 'mcq'/'frq' accepted by API
        limit: 1
      };

      const res = await axios.get(`${API_BASE}/api/questions`, { params: query });

      if (!res.data?.success || !res.data?.data || res.data.data.length === 0) {
        await interaction.editReply({
          content: 'No questions found matching your criteria. Try different filters.',
          ephemeral: true
        });
        return;
      }

      const question = res.data.data[0];

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Anatomy - Endocrine')
        .setDescription(question.question);

      const fields = [];

      // MCQ answer choices
      if (Array.isArray(question.options) && question.options.length > 0) {
        const answerChoices = question.options
          .map((opt, i) => `**${String.fromCharCode(65 + i)})** ${opt}`)
          .join('\n');

        fields.push({
          name: '**Answer Choices:**',
          value: answerChoices,
          inline: false
        });
      }

      // Division
      if (question.division) {
        fields.push({
          name: '**Division:**',
          value: String(question.division),
          inline: true
        });
      }

      // Difficulty + Subtopics
      fields.push(
        {
          name: '**Difficulty:**',
          value: typeof question.difficulty === 'number' ? `${Math.round(question.difficulty * 100)}%` : 'N/A',
          inline: true
        },
        {
          name: '**Subtopic(s):**',
          value: Array.isArray(question.subtopics) && question.subtopics.length > 0
            ? question.subtopics.join(', ')
            : 'None',
          inline: true
        }
      );

      embed.addFields(...fields);
      embed.setFooter({ text: 'Use the buttons below to check your answer or get an explanation.' });

      // Buttons
      const checkCustomId = `ae_check_${question.id}`;
      const explainCustomId = `ae_explain_${question.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(checkCustomId)
          .setLabel('Check answer')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(explainCustomId)
          .setLabel('Explain question')
          .setStyle(ButtonStyle.Primary)
      );

      const msg = await interaction.editReply({ embeds: [embed], components: [row] });

      // Create a collector for the buttons on this message; allow unlimited presses
      const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button });

      buttonCollector.on('collect', async (btn) => {
        try {
          // Only allow these two customIds
          if (btn.customId !== checkCustomId && btn.customId !== explainCustomId) return;

          // Re-fetch the freshest question by ID so we always have answers, options, etc.
          const qRes = await axios.get(`${API_BASE}/api/questions/${question.id}`);
          const freshQ = qRes.data?.data || question;

          // --- CHECK ANSWER FLOW ---
          if (btn.customId === checkCustomId) {
            const isMcq = Array.isArray(freshQ.options) && freshQ.options.length > 0;

            const modalId = `ae_modal_${freshQ.id}`;
            const modal = new ModalBuilder()
              .setCustomId(modalId)
              .setTitle('Submit your answer');

            const prompt = isMcq
              ? 'Enter the letter of your answer (A, B, C, ...)'
              : 'Enter your answer';

            const answerInput = new TextInputBuilder()
              .setCustomId('user_answer')
              .setLabel(prompt)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true);

            const modalRow = new ActionRowBuilder().addComponents(answerInput);
            modal.addComponents(modalRow);

            await btn.showModal(modal);

            // Wait for this user to submit the modal
            let submission;
            try {
              submission = await btn.awaitModalSubmit({
                time: 120000, // 2 minutes
                filter: (i) => i.customId === modalId && i.user.id === btn.user.id
              });
            } catch (e) {
              // No submission
              return;
            }

            const userAnswerRaw = submission.fields.getTextInputValue('user_answer') || '';
            const userAnswer = String(userAnswerRaw).trim();

            if (isMcq) {
              // MCQ grading (compare letters)
              const { index: correctIdx, letter: correctLetter } = getCorrectMcqIndex(freshQ);
              const userLetter = normalizeUserMcqLetter(userAnswer);

              if (correctIdx == null || !correctLetter) {
                await submission.reply({
                  content: 'Sorry, I could not determine the correct answer for this question.',
                  ephemeral: true
                });
                return;
              }

              const isCorrect = userLetter === correctLetter;
              const correctText = freshQ.options[correctIdx];

              await submission.reply({
                ephemeral: true,
                content: [
                  isCorrect ? '✅ **Correct!**' : '❌ **Incorrect.**',
                  '',
                  `**Your answer:** ${userLetter || userAnswer}`,
                  `**Correct answer:** ${correctLetter}) ${correctText}`
                ].join('\n')
              });
            } else {
              // FRQ grading via Gemini
              try {
                const gradeRes = await axios.post(`${API_BASE}/api/gemini/grade-free-responses`, {
                  freeResponses: [{
                    question: freshQ.question,
                    correctAnswers: freshQ.answers || [],
                    studentAnswer: userAnswer
                  }]
                });

                const result = Array.isArray(gradeRes.data?.data)
                  ? gradeRes.data.data[0]
                  : (gradeRes.data?.data || gradeRes.data);

                // Try common flags; fall back to heuristic
                const isCorrect = !!(result?.isCorrect ?? result?.correct ?? result?.passed);
                const feedback = result?.feedback || result?.explanation || result?.reason || null;

                await submission.reply({
                  ephemeral: true,
                  content: [
                    isCorrect ? '✅ **Marked correct!**' : '❌ **Marked incorrect.**',
                    '',
                    `**Your answer:** ${userAnswer}`,
                    // Show "known" correct answers if present
                    freshQ.answers && freshQ.answers.length
                      ? `**Expected (reference):** ${freshQ.answers.join(' | ')}`
                      : '',
                    feedback ? `\n**Feedback:** ${feedback}` : ''
                  ].filter(Boolean).join('\n')
                });
              } catch (e) {
                console.error('FRQ grading error:', e?.response?.data || e);
                await submission.reply({
                  ephemeral: true,
                  content: 'Sorry, I couldn’t grade that right now. Please try again in a moment.'
                });
              }
            }
            return;
          }

          // --- EXPLAIN QUESTION FLOW ---
          if (btn.customId === explainCustomId) {
            try {
              const explainPayload = {
                // Per docs, only the question object is required; include helpful fields
                question: {
                  question: freshQ.question,
                  options: freshQ.options || [],
                  answers: freshQ.answers || [],
                  difficulty: freshQ.difficulty,
                  subtopics: freshQ.subtopics || [],
                  event: freshQ.event,
                  division: freshQ.division
                }
              };

              const explRes = await axios.post(`${API_BASE}/api/gemini/explain`, explainPayload);
              const explanation =
                explRes.data?.data?.explanation ||
                explRes.data?.data ||
                explRes.data?.message ||
                'No explanation available.';

              await btn.reply({
                ephemeral: true,
                content: `**Explanation:**\n${typeof explanation === 'string' ? explanation : JSON.stringify(explanation, null, 2)}`
              });
            } catch (e) {
              console.error('Explain error:', e?.response?.data || e);
              await btn.reply({
                ephemeral: true,
                content: 'Sorry, I couldn’t fetch an explanation right now.'
              });
            }
          }
        } catch (innerErr) {
          console.error('Component handling error:', innerErr);
          try {
            if (!btn.replied && !btn.deferred) {
              await btn.reply({ ephemeral: true, content: 'Something went wrong handling that action.' });
            }
          } catch {} // ignore
        }
      });

    } catch (err) {
      console.error('Error in Anatomy Endocrine command:', err);

      if (err.response && err.response.status === 429) {
        await interaction.editReply({
          content: 'Rate limit exceeded. Please try again in a few moments.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: 'Command failed. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};

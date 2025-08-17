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

// Small helpers
const prune = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const pickFirstQuestion = (arr) => Array.isArray(arr) && arr.length > 0 ? arr[0] : null;

// Install one-time handlers for the Answer button + modal
function ensureHandlers(client) {
  if (client._aeHandlersInstalled) return;
  client._aeHandlersInstalled = true;

  client.on('interactionCreate', async (i) => {
    try {
      // 1) Button clicked → show modal
      if (i.isButton() && i.customId.startsWith('ae:answer:')) {
        const [, , base52] = i.customId.split(':');
        if (!base52) return i.reply({ content: 'Missing question ID.', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`ae:submit:${base52}:${i.user.id}`)
          .setTitle('Submit Your Answer');

        const input = new TextInputBuilder()
          .setCustomId('answer_input')
          .setLabel('Your answer (A/B/C/D or text)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await i.showModal(modal);
        return;
      }

      // 2) Modal submitted → grade and reply
      if (i.isModalSubmit() && i.customId.startsWith('ae:submit:')) {
        const [, , base52, targetUserId] = i.customId.split(':');

        // Only the opener should be able to submit this modal
        if (i.user.id !== targetUserId) {
          return i.reply({ content: "This form isn't for you.", ephemeral: true });
        }

        const userAnswerRaw = i.fields.getTextInputValue('answer_input');

        // Fetch question by base52
        let question;
        try {
          const qRes = await axios.get(`https://scio.ly/api/questions/base52/${encodeURIComponent(base52)}`, { timeout: 15000 });
          if (!qRes.data?.success || !qRes.data?.data) {
            return i.reply({ content: 'Question not found.', ephemeral: true });
          }
          question = qRes.data.data;
        } catch (e) {
          console.error('Fetch by base52 failed:', e?.response?.status, e?.message);
          return i.reply({ content: 'Could not load the question. Try again.', ephemeral: true });
        }

        // ---- Grade ----
        const numberToLetter = (num) => {
          const n = typeof num === 'string' ? parseInt(num, 10) : num;
          if (Number.isNaN(n) || n < 0) return String(num).toUpperCase();
          return String.fromCharCode(65 + n); // 0->A, 1->B...
        };
        const normalizeUserAnswer = (ans) => {
          const t = ans.trim();
          if (/^\d+$/.test(t)) return numberToLetter(parseInt(t, 10)); // "0" -> "A"
          return t.toUpperCase();
        };

        let isCorrect = false;
        let correctAnswers = [];

        if (Array.isArray(question.options) && question.options.length > 0) {
          // MCQ
          const rawAnswers = Array.isArray(question.answers) ? question.answers : [question.answers];
          const correctLetters = rawAnswers.map(a => numberToLetter(a));
          correctAnswers = correctLetters;

          const normalizedUser = normalizeUserAnswer(userAnswerRaw);

          // Letter match (A/B/C/..)
          isCorrect = correctLetters.includes(normalizedUser);

          // Fallback: match option text (case-insensitive)
          if (!isCorrect) {
            const optionText = question.options.map(s => String(s).trim().toUpperCase());
            // Map user's text to index if matches an option's text
            const idx = optionText.indexOf(normalizedUser);
            if (idx !== -1) {
              isCorrect = correctLetters.includes(numberToLetter(idx));
            }
          }
        } else {
          // FRQ → call grader
          try {
            const gradeRes = await axios.post('https://scio.ly/api/gemini/grade-free-responses', {
              freeResponses: [{
                question,
                correctAnswers: Array.isArray(question.answers) ? question.answers : [question.answers],
                studentAnswer: userAnswerRaw,
              }],
            }, { timeout: 30000 });

            if (gradeRes.data?.success && Array.isArray(gradeRes.data.data) && gradeRes.data.data.length > 0) {
              const result = gradeRes.data.data[0];
              isCorrect = !!result.isCorrect;
              const rawAnswers = Array.isArray(question.answers) ? question.answers : [question.answers];
              correctAnswers = rawAnswers.map(a => String(a));
            } else {
              throw new Error('Failed to grade response');
            }
          } catch (err) {
            console.error('Error grading FRQ:', err);
            return i.reply({ content: 'Grading failed. Please try again in a few moments.', ephemeral: true });
          }
        }

        const resultEmbed = new EmbedBuilder()
          .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
          .setTitle(isCorrect ? '**Correct!**' : '**Incorrect**')
          .setDescription(`**Question:** ${question.question}`)
          .addFields(
            { name: '**Your Answer:**', value: userAnswerRaw, inline: true },
            {
              name: '**Correct Answer(s):**',
              value: Array.isArray(correctAnswers) ? correctAnswers.join(', ') : String(correctAnswers),
              inline: true,
            },
            { name: '**Question ID (base52):**', value: question.base52 || 'Unavailable', inline: false },
            { name: '**Question ID (UUID):**', value: question.id || 'Unavailable', inline: false },
          )
          .setFooter({ text: 'Use /explain to get a detailed explanation!' });

        return i.reply({ embeds: [resultEmbed], ephemeral: true });
      }
    } catch (err) {
      console.error('anatomyendocrine handlers error:', err);
      // Best-effort: avoid throwing
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
      ensureHandlers(interaction.client); // install one-time handlers

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
          { name: '**Question ID (base52):**', value: String(question.base52 ?? '—'), inline: false },
        )
        .setFooter({ text: 'Click "Submit Answer" below to answer.' });

      const components = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ae:answer:${question.base52 || question.id}`) // fall back to UUID if needed
          .setStyle(ButtonStyle.Primary)
          .setLabel('Submit Answer'),
      );

      await interaction.editReply({ embeds: [embed], components: [components] });

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

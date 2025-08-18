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

// ---------- helpers ----------
function getCorrectMcqIndex(question) {
  const opts = question.options || [];
  const answers = Array.isArray(question.answers)
    ? question.answers
    : (question.answers ? [question.answers] : []);
  if (!opts.length || !answers.length) return { index: null, letter: null };

  const first = answers[0];

  // Number -> could be 0- or 1-based
  if (typeof first === 'number') {
    if (first >= 0 && first < opts.length) return { index: first, letter: String.fromCharCode(65 + first) };
    if (first >= 1 && first <= opts.length) return { index: first - 1, letter: String.fromCharCode(64 + first) };
  }

  if (typeof first === 'string') {
    const s = first.trim();
    // Letter (A/B/...)
    if (/^[A-Za-z]$/.test(s)) {
      const idx = s.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < opts.length) return { index: idx, letter: s.toUpperCase() };
    }
    // Exact option text match
    const idx2 = opts.findIndex(o => String(o).trim().toLowerCase() === s.toLowerCase());
    if (idx2 !== -1) return { index: idx2, letter: String.fromCharCode(65 + idx2) };
  }

  return { index: null, letter: null };
}

function normalizeUserMcqLetter(input) {
  if (!input) return null;
  const m = String(input).trim().match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : null;
}

// ---------- command export ----------
const command = {
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

      const params = {
        event: 'Anatomy - Endocrine',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType, // 'mcq'/'frq'
        limit: 1
      };

      const res = await axios.get(`${API_BASE}/api/questions`, { params });

      if (!res.data?.success || !res.data?.data || res.data.data.length === 0) {
        await interaction.editReply('No questions found matching your criteria. Try different filters.');
        return;
      }

      const q = res.data.data[0];

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Anatomy - Endocrine')
        .setDescription(q.question);

      const fields = [];

      if (Array.isArray(q.options) && q.options.length > 0) {
        const answerChoices = q.options
          .map((opt, i) => `**${String.fromCharCode(65 + i)})** ${opt}`)
          .join('\n');
        fields.push({ name: '**Answer Choices:**', value: answerChoices, inline: false });
      }

      if (q.division) {
        fields.push({ name: '**Division:**', value: String(q.division), inline: true });
      }

      fields.push(
        {
          name: '**Difficulty:**',
          value: typeof q.difficulty === 'number' ? `${Math.round(q.difficulty * 100)}%` : 'N/A',
          inline: true
        },
        {
          name: '**Subtopic(s):**',
          value: Array.isArray(q.subtopics) && q.subtopics.length ? q.subtopics.join(', ') : 'None',
          inline: true
        },
      );

      embed.addFields(...fields);
      embed.setFooter({ text: 'Use the buttons below to check your answer or get an explanation.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ae:check:${q.id}`)
          .setLabel('Check answer')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ae:explain:${q.id}`)
          .setLabel('Explain question')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('Error in /anatomyendocrine:', err?.response?.data || err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('Command failed. Please try again later.');
      } else {
        await interaction.reply({ content: 'Command failed. Please try again later.', ephemeral: true });
      }
    }
  },
};

// ---------- global handlers exported from same file ----------
async function handleButton(interaction) {
  if (!interaction.isButton()) return false;
  const id = interaction.customId;
  if (!id.startsWith('ae:')) return false;

  const [, action, qid] = id.split(':'); // ae:check:<id> | ae:explain:<id>
  if (!action || !qid) return false;

  try {
    // Always pull the freshest copy
    const qRes = await axios.get(`${API_BASE}/api/questions/${qid}`);
    const q = qRes.data?.data;
    if (!q) {
      await interaction.reply({ ephemeral: true, content: 'Could not find that question anymore.' });
      return true;
    }

    if (action === 'explain') {
      await interaction.deferReply({ ephemeral: true });

      const payload = {
        question: {
          question: q.question,
          options: q.options || [],
          answers: q.answers || [],
          difficulty: q.difficulty,
          subtopics: q.subtopics || [],
          event: q.event,
          division: q.division
        }
      };

      try {
        const explRes = await axios.post(`${API_BASE}/api/gemini/explain`, payload);
        const explanation =
          explRes.data?.data?.explanation ||
          explRes.data?.data ||
          'No explanation available.';
        await interaction.editReply(
          `**Explanation:**\n${typeof explanation === 'string' ? explanation : JSON.stringify(explanation, null, 2)}`
        );
      } catch (e) {
        console.error('Explain error:', e?.response?.data || e);
        await interaction.editReply('Sorry, I couldn’t fetch an explanation right now.');
      }
      return true;
    }

    if (action === 'check') {
      // Show a modal (acknowledges within 3s)
      const modal = new ModalBuilder()
        .setCustomId(`ae:modal:${qid}`)
        .setTitle('Submit your answer');

      const prompt = Array.isArray(q.options) && q.options.length > 0
        ? 'Enter the letter of your answer (A, B, C, ...)'
        : 'Enter your answer';

      const input = new TextInputBuilder()
        .setCustomId('user_answer')
        .setLabel(prompt)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return true;
    }

    return false;
  } catch (err) {
    console.error('handleButton error:', err?.response?.data || err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ephemeral: true, content: 'Something went wrong handling that action.' });
    }
    return true;
  }
}

async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith('ae:modal:')) return false;

  const qid = interaction.customId.split(':')[2];
  try {
    await interaction.deferReply({ ephemeral: true });

    const qRes = await axios.get(`${API_BASE}/api/questions/${qid}`);
    const q = qRes.data?.data;
    if (!q) {
      await interaction.editReply('Could not find that question anymore.');
      return true;
    }

    const userAnswerRaw = interaction.fields.getTextInputValue('user_answer') || '';
    const userAnswer = String(userAnswerRaw).trim();

    const isMcq = Array.isArray(q.options) && q.options.length > 0;

    if (isMcq) {
      const { index: correctIdx, letter: correctLetter } = getCorrectMcqIndex(q);
      if (correctIdx == null || !correctLetter) {
        await interaction.editReply('Sorry, I could not determine the correct answer for this question.');
        return true;
      }
      const userLetter = normalizeUserMcqLetter(userAnswer);
      const isCorrect = userLetter === correctLetter;
      const correctText = q.options[correctIdx];

      await interaction.editReply(
        [
          isCorrect ? '✅ **Correct!**' : '❌ **Incorrect.**',
          '',
          `**Your answer:** ${userLetter || userAnswer}`,
          `**Correct answer:** ${correctLetter}) ${correctText}`
        ].join('\n')
      );
      return true;
    }

    // FRQ: use Gemini grader
    try {
      const gradeRes = await axios.post(`${API_BASE}/api/gemini/grade-free-responses`, {
        freeResponses: [{
          question: q.question,
          correctAnswers: q.answers || [],
          studentAnswer: userAnswer
        }]
      });

      const result = Array.isArray(gradeRes.data?.data)
        ? gradeRes.data.data[0]
        : (gradeRes.data?.data || gradeRes.data);

      const isCorrect = !!(result?.isCorrect ?? result?.correct ?? result?.passed);
      const feedback = result?.feedback || result?.explanation || result?.reason || null;

      await interaction.editReply(
        [
          isCorrect ? '✅ **Marked correct!**' : '❌ **Marked incorrect.**',
          '',
          `**Your answer:** ${userAnswer}`,
          q.answers && q.answers.length ? `**Expected (reference):** ${q.answers.join(' | ')}` : '',
          feedback ? `\n**Feedback:** ${feedback}` : ''
        ].filter(Boolean).join('\n')
      );
    } catch (e) {
      console.error('FRQ grading error:', e?.response?.data || e);
      await interaction.editReply('Sorry, I couldn’t grade that right now. Please try again in a moment.');
    }

    return true;
  } catch (err) {
    console.error('handleModal error:', err?.response?.data || err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ephemeral: true, content: 'Something went wrong handling that action.' });
    }
    return true;
  }
}

module.exports = {
  ...command,
  handleButton,
  handleModal,
};

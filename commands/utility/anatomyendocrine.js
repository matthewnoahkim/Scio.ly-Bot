// /commands/anatomyendocrine.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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

const API_KEY = 'xo9IKNJG65e0LMBa55Tq';
const API_BASE_URL = 'https://scio.ly';

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
        limit: 1
      };

      const res = await axios.get('http://scioly-api.vercel.app/api/questions', { params: query });
      
      if (!res.data.success || !res.data.data || res.data.data.length === 0) {
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

      // Add answer choices if it's an MCQ
      if (question.options && question.options.length > 0) {
        const answerChoices = question.options
          .map((opt, i) => `**${String.fromCharCode(65 + i)})** ${opt}`)
          .join('\n');
        
        fields.push({
          name: '**Answer Choices:**',
          value: answerChoices,
          inline: false
        });
      }

      fields.push(
        {
          name: '**Division:**',
          value: question.division || 'Not specified',
          inline: true
        },
        {
          name: '**Difficulty:**',
          value: `${Math.round(question.difficulty * 100)}%`,
          inline: true
        },
        {
          name: '**Subtopic(s):**',
          value: question.subtopics?.join(', ') || 'None',
          inline: true
        }
      );

      embed.addFields(...fields);

      // Create buttons
      const checkAnswerButton = new ButtonBuilder()
        .setCustomId(`check_answer_${question.id}`)
        .setLabel('Check Answer')
        .setStyle(ButtonStyle.Primary);

      const explainButton = new ButtonBuilder()
        .setCustomId(`explain_question_${question.id}`)
        .setLabel('Explain Question')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder()
        .addComponents(checkAnswerButton, explainButton);

      await interaction.editReply({ 
        embeds: [embed], 
        components: [row] 
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
  },

  // Handle button interactions
  async handleButtonInteraction(interaction) {
    const customId = interaction.customId;
    
    if (customId.startsWith('check_answer_')) {
      await this.handleCheckAnswer(interaction);
    } else if (customId.startsWith('explain_question_')) {
      await this.handleExplainQuestion(interaction);
    }
  },

  async handleCheckAnswer(interaction) {
    try {
      const questionId = interaction.customId.replace('check_answer_', '');
      
      // First, get the question data from the API
      const questionRes = await axios.post(`${API_BASE_URL}/api/questions/batch`, 
        { ids: [questionId] },
        { headers: { 'X-API-Key': API_KEY } }
      );

      if (!questionRes.data.success || !questionRes.data.data || questionRes.data.data.length === 0) {
        await interaction.reply({
          content: 'Could not retrieve question data. Please try again.',
          ephemeral: true
        });
        return;
      }

      const question = questionRes.data.data[0];
      
      // Create modal for answer input
      const modal = new ModalBuilder()
        .setCustomId(`answer_modal_${questionId}`)
        .setTitle('Submit Your Answer');

      const answerInput = new TextInputBuilder()
        .setCustomId('user_answer')
        .setLabel(question.options && question.options.length > 0 ? 'Your answer (A, B, C, D, etc.)' : 'Your answer')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(question.options && question.options.length > 0 ? 1 : 500);

      const firstActionRow = new ActionRowBuilder().addComponents(answerInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    } catch (err) {
      console.error('Error handling check answer:', err);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  },

  async handleExplainQuestion(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const questionId = interaction.customId.replace('explain_question_', '');
      
      // Get the question data
      const questionRes = await axios.post(`${API_BASE_URL}/api/questions/batch`, 
        { ids: [questionId] },
        { headers: { 'X-API-Key': API_KEY } }
      );

      if (!questionRes.data.success || !questionRes.data.data || questionRes.data.data.length === 0) {
        await interaction.editReply({
          content: 'Could not retrieve question data. Please try again.'
        });
        return;
      }

      const question = questionRes.data.data[0];
      
      // Call the AI explain endpoint
      const explainRes = await axios.post(`${API_BASE_URL}/api/gemini/explain`, 
        { question: question },
        { headers: { 'X-API-Key': API_KEY } }
      );

      if (!explainRes.data.success) {
        await interaction.editReply({
          content: 'Could not generate explanation. Please try again later.'
        });
        return;
      }

      const explanation = explainRes.data.data.explanation;
      
      const explainEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Question Explanation')
        .setDescription(explanation.length > 4096 ? explanation.substring(0, 4093) + '...' : explanation);

      await interaction.editReply({ embeds: [explainEmbed] });

    } catch (err) {
      console.error('Error handling explain question:', err);
      await interaction.editReply({
        content: 'An error occurred while generating the explanation.'
      });
    }
  },

  // Handle modal submissions
  async handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith('answer_modal_')) return;

    try {
      await interaction.deferReply({ ephemeral: true });
      
      const questionId = interaction.customId.replace('answer_modal_', '');
      const userAnswer = interaction.fields.getTextInputValue('user_answer');
      
      // Get the question data
      const questionRes = await axios.post(`${API_BASE_URL}/api/questions/batch`, 
        { ids: [questionId] },
        { headers: { 'X-API-Key': API_KEY } }
      );

      if (!questionRes.data.success || !questionRes.data.data || questionRes.data.data.length === 0) {
        await interaction.editReply({
          content: 'Could not retrieve question data. Please try again.'
        });
        return;
      }

      const question = questionRes.data.data[0];
      let isCorrect = false;
      let correctAnswer = '';

      if (question.options && question.options.length > 0) {
        // MCQ - compare letter answers
        const userLetter = userAnswer.toUpperCase().trim();
        const correctIndex = question.answers[0]; // Assuming first answer is correct for MCQ
        const correctLetter = String.fromCharCode(65 + correctIndex);
        correctAnswer = `${correctLetter}) ${question.options[correctIndex]}`;
        isCorrect = userLetter === correctLetter;
      } else {
        // FRQ - use AI grading
        const gradeRes = await axios.post(`${API_BASE_URL}/api/gemini/grade-free-responses`, 
          {
            responses: [{
              question: question.question,
              correctAnswers: question.answers,
              studentAnswer: userAnswer
            }]
          },
          { headers: { 'X-API-Key': API_KEY } }
        );

        if (gradeRes.data.success && gradeRes.data.data.grades.length > 0) {
          const grade = gradeRes.data.data.grades[0];
          isCorrect = grade.score >= 0.7; // Consider 70%+ as correct
          correctAnswer = question.answers.join(', ');
        } else {
          correctAnswer = question.answers.join(', ');
          isCorrect = false;
        }
      }

      const resultEmbed = new EmbedBuilder()
        .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
        .setTitle(isCorrect ? '✅ Correct!' : '❌ Incorrect')
        .addFields(
          { name: 'Your Answer:', value: userAnswer, inline: false },
          { name: 'Correct Answer:', value: correctAnswer, inline: false }
        );

      await interaction.editReply({ embeds: [resultEmbed] });

    } catch (err) {
      console.error('Error handling modal submit:', err);
      await interaction.editReply({
        content: 'An error occurred while checking your answer.'
      });
    }
  }
};
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

// Store question data temporarily for button interactions
const questionCache = new Map();

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
      
      // Cache the question data for button interactions
      questionCache.set(question.id, question);
      
      // Clean up old cached questions (keep only last 100)
      if (questionCache.size > 100) {
        const entries = Array.from(questionCache.entries());
        const toDelete = entries.slice(0, entries.length - 100);
        toDelete.forEach(([id]) => questionCache.delete(id));
      }

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
        .setCustomId(`anatomyendocrine_check_${question.id}`)
        .setLabel('Check Answer')
        .setStyle(ButtonStyle.Primary);

      const explainButton = new ButtonBuilder()
        .setCustomId(`anatomyendocrine_explain_${question.id}`)
        .setLabel('Explain Question')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder()
        .addComponents(checkAnswerButton, explainButton);

      const response = await interaction.editReply({ 
        embeds: [embed], 
        components: [row] 
      });

      // Set up collectors for button interactions
      this.setupCollectors(response, question);

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

  setupCollectors(message, question) {
    // Button collector
    const buttonCollector = message.createMessageComponentCollector({
      filter: i => i.customId.startsWith('anatomyendocrine_'),
      time: 300000 // 5 minutes
    });

    buttonCollector.on('collect', async (buttonInteraction) => {
      try {
        if (buttonInteraction.customId.startsWith('anatomyendocrine_check_')) {
          await this.handleCheckAnswer(buttonInteraction, question);
        } else if (buttonInteraction.customId.startsWith('anatomyendocrine_explain_')) {
          await this.handleExplainQuestion(buttonInteraction, question);
        }
      } catch (error) {
        console.error('Error handling button interaction:', error);
        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          await buttonInteraction.reply({
            content: 'An error occurred while processing your request.',
            ephemeral: true
          });
        }
      }
    });

    buttonCollector.on('end', () => {
      // Clean up the question from cache when collector expires
      questionCache.delete(question.id);
    });
  },

  async handleCheckAnswer(interaction, question) {
    try {      
      // Create modal for answer input
      const modal = new ModalBuilder()
        .setCustomId(`anatomyendocrine_modal_${question.id}`)
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

      // Set up modal collector
      const modalCollector = interaction.awaitModalSubmit({
        filter: i => i.customId === `anatomyendocrine_modal_${question.id}`,
        time: 120000 // 2 minutes
      });

      modalCollector.then(async (modalInteraction) => {
        await this.handleModalSubmit(modalInteraction, question);
      }).catch(error => {
        if (error.code !== 'INTERACTION_COLLECTOR_ERROR') {
          console.error('Modal collector error:', error);
        }
      });

    } catch (err) {
      console.error('Error handling check answer:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      }
    }
  },

  async handleExplainQuestion(interaction, question) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.editReply({
          content: 'An error occurred while generating the explanation.'
        });
      } else {
        await interaction.editReply({
          content: 'An error occurred while generating the explanation.'
        });
      }
    }
  },

  async handleModalSubmit(interaction, question) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const userAnswer = interaction.fields.getTextInputValue('user_answer');
      
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
        try {
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
          }
        } catch (gradeError) {
          console.error('Error grading FRQ:', gradeError);
          // Fallback to simple string comparison if AI grading fails
          const userAnswerLower = userAnswer.toLowerCase().trim();
          isCorrect = question.answers.some(answer => 
            userAnswerLower.includes(answer.toString().toLowerCase().trim())
          );
        }
        correctAnswer = question.answers.join(', ');
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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.editReply({
          content: 'An error occurred while checking your answer.'
        });
      } else {
        await interaction.editReply({
          content: 'An error occurred while checking your answer.'
        });
      }
    }
  }
};
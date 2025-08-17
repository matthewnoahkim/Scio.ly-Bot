// /commands/chemistrylab.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const questionTypeOptions = ["MCQ", "FRQ"];
const divisionOptions = ["Division C"];
const difficultyOptions = [
  "Very Easy (0-19%)",
  "Easy (20-39%)", 
  "Medium (40-59%)",
  "Hard (60-79%)",
  "Very Hard (80-100%)"
];
const subtopicOptions = ["Stoichiometry", "Equilibrium", "Periodicity", "Redox Reactions", "Aqueous Solutions", "Acids and Bases", "Physical Properties", "Thermodynamics", "Gas Laws", "Kinetics", "Electrochemistry"];

const difficultyMap = {
  "Very Easy (0-19%)": { min: 0.0, max: 0.19 },
  "Easy (20-39%)": { min: 0.2, max: 0.39 },
  "Medium (40-59%)": { min: 0.4, max: 0.59 },
  "Hard (60-79%)": { min: 0.6, max: 0.79 },
  "Very Hard (80-100%)": { min: 0.8, max: 1.0 }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chemistrylab')
    .setDescription('Get a Chemistry Lab question')
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
    let hasReplied = false;
    
    try {
      // Check if interaction is still valid before deferring
      if (interaction.deferred || interaction.replied) {
        return;
      }

      await interaction.deferReply();
      hasReplied = true;

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
        event: 'Chemistry Lab',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType,
        limit: 1
      };

      // Add timeout to the API request to prevent hanging
      const res = await axios.get('http://scioly-api.vercel.app/api/questions', { 
        params: query,
        timeout: 10000 // 10 second timeout
      });
      
      if (!res.data.success || !res.data.data || res.data.data.length === 0) {
        if (hasReplied && !interaction.replied) {
          await interaction.editReply({
            content: 'No questions found matching your criteria. Try different filters.'
          });
        }
        return;
      }

      const question = res.data.data[0];

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Chemistry Lab')
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

      // Fixed: Removed duplicate difficulty field
      fields.push(
        {
          name: '**Difficulty:**',
          value: `${Math.round(question.difficulty * 100)}%`,
          inline: true
        },
        {
          name: '**Subtopic(s):**',
          value: question.subtopics?.join(', ') || 'None',
          inline: true
        },
        {
          name: '**Question ID:**',
          value: question.base52 || question.id?.toString() || 'N/A',
          inline: false
        }
      );

      embed.addFields(...fields);
      embed.setFooter({ text: 'Use /check to check your answer!' });

      // Check if we can still reply before attempting
      if (hasReplied && !interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('Error in Chemistry Lab command:', err);
      
      // Only attempt to reply if we haven't already and the interaction is still valid
      try {
        if (!hasReplied && !interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: 'Command failed. Please try again later.',
            ephemeral: true
          });
        } else if (hasReplied && !interaction.replied) {
          let errorMessage = 'Command failed. Please try again later.';
          
          if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
            errorMessage = 'Request timed out. Please try again later.';
          } else if (err.response && err.response.status === 429) {
            errorMessage = 'Rate limit exceeded. Please try again in a few moments.';
          }
          
          await interaction.editReply({
            content: errorMessage
          });
        }
      } catch (replyErr) {
        // If we can't reply, just log it - don't throw another error
        console.error('Failed to send error message:', replyErr);
      }
    }
  }
};
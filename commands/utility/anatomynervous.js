// /commands/anatomynervous.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
const subtopicOptions = ["Brain", "Spinal Cord", "Nerves", "Reflexes", "Neurotransmitters"];

const difficultyMap = {
  "Very Easy (0-19%)": { min: 0.0, max: 0.19 },
  "Easy (20-39%)": { min: 0.2, max: 0.39 },
  "Medium (40-59%)": { min: 0.4, max: 0.59 },
  "Hard (60-79%)": { min: 0.6, max: 0.79 },
  "Very Hard (80-100%)": { min: 0.8, max: 1.0 }
};

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

      const query = {
        event: 'Anatomy - Nervous',
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: questionType,
        limit: 1
      };

      const res = await axios.get('http://scio.ly/api/questions', { params: query });
      
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
        .setTitle('Anatomy - Nervous')
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
          value: question.division,
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
        },
        {
          name: '**Question ID:**',
          value: question.base52,
          inline: false
        }
      );

      embed.addFields(...fields);
      embed.setFooter({ text: 'Use /check to check your answer!' });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Error in Anatomy Nervous command:', err);
      
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
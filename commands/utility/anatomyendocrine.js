// /commands/anatomyendocrine.js
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

const subtopicOptions = ["Hormones", "Glands", "Regulation", "Feedback", "Development"];

const difficultyMap = {
  "Very Easy (0-19%)": { min: 0.0, max: 0.19 },
  "Easy (20-39%)":     { min: 0.2, max: 0.39 },
  "Medium (40-59%)":   { min: 0.4, max: 0.59 },
  "Hard (60-79%)":     { min: 0.6, max: 0.79 },
  "Very Hard (80-100%)": { min: 0.8, max: 1.0 }
};

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
        // Maps "Division B" -> "B", "Division C" -> "C"
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
      await interaction.deferReply(); // public reply by default

      const questionType = interaction.options.getString('question_type'); // "mcq" | "frq" | null
      const division = interaction.options.getString('division'); // "B" | "C" | null
      const difficultyLabel = interaction.options.getString('difficulty');
      const subtopic = interaction.options.getString('subtopic');

      let difficulty_min, difficulty_max;
      if (difficultyLabel && difficultyMap[difficultyLabel]) {
        difficulty_min = difficultyMap[difficultyLabel].min;
        difficulty_max = difficultyMap[difficultyLabel].max;
      }

      const query = {
        event: 'Anatomy - Endocrine',
        division,             // "B" | "C"
        difficulty_min,       // optional
        difficulty_max,       // optional
        subtopic,             // optional
        question_type: questionType, // "mcq" | "frq"
        limit: 1
      };

      const res = await axios.get('https://scio.ly/api/questions', { params: query });

      if (!res.data?.success) {
        await interaction.editReply({ content: 'API error. Please try again later.' });
        return;
      }

      // The API returns an array for /api/questions. Be defensive if a single object sneaks through.
      const raw = res.data.data;
      const questions = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      if (questions.length === 0) {
        await interaction.editReply({ content: 'No questions found matching your criteria. Try different filters.' });
        return;
      }

      const question = questions[0];

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Anatomy - Endocrine')
        .setDescription(question.question ?? '—');

      const fields = [];

      // Add answer choices if it's an MCQ
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

      fields.push(
        { name: '**Division:**', value: String(question.division ?? '—'), inline: true },
        { name: '**Difficulty:**', value: Number.isFinite(question.difficulty) ? `${Math.round(question.difficulty * 100)}%` : '—', inline: true },
        { name: '**Subtopic(s):**', value: (question.subtopics && question.subtopics.length) ? question.subtopics.join(', ') : 'None', inline: true },
        // Use the API-provided base52 field (fallback to UUID if missing)
        { name: '**Question ID (base-52):**', value: String(question.base52 ?? question.id ?? '—'), inline: false }
      );

      embed.addFields(...fields);
      embed.setFooter({ text: 'Use /check to check your answer!' });

      await interaction.editReply({ embeds: [embed] });

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

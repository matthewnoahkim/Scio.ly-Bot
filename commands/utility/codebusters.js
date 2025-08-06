const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const divisionOptions = ["B", "C", "B/C"];

const cipherTypeOptions = [
  "Random Aristocrat", "K1 Aristocrat", "K2 Aristocrat", 
  "Random Patristocrat", "K1 Patristocrat", "K2 Patristocrat",
  "Baconian", "Fractionated Morse", "Columnar Transposition", 
  "Xenocrypt", "Porta", "Nihilist", "Atbash", "Caesar", 
  "Affine", "Hill 2x2"
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('codebusters')
    .setDescription('Sends a cipher for you to solve')
    .addStringOption(option =>
      option.setName('division')
        .setDescription('Division')
        .setRequired(false)
        .addChoices(...divisionOptions.map(d => ({ name: d, value: d }))))
    .addStringOption(option =>
      option.setName('cipher_type')
        .setDescription('Cipher type (leave blank for random)')
        .setRequired(false)
        .addChoices(...cipherTypeOptions.map(c => ({ name: c, value: c })))),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const division = interaction.options.getString('division');
      const cipherType = interaction.options.getString('cipher_type');

      const query = {
        event: 'Codebusters',
        division,
        cipher_type: cipherType,
        limit: 1
      };

      const res = await axios.get('https://scio.ly/api/questions', { params: query });
      const question = res.data.data[0];

      if (!question) {
        await interaction.editReply({
          content: 'Command failed. Please visit https://tinyurl.com/HylasTheCatDocumentation for help.',
          ephemeral: true
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Codebusters')
        .setDescription(question.question)
        .addFields(
          {
            name: '**Division:**',
            value: question.division || 'N/A',
            inline: true
          },
          {
            name: '**Cipher Type:**',
            value: question.cipher_type || 'N/A',
            inline: true
          },
          {
            name: '**Question ID:**',
            value: question.id.toString(),
            inline: true
          }
        );

      if (question.replacement_table) {
        embed.addFields({
          name: '**Replacement Table:**',
          value: `\`\`\`${question.replacement_table}\`\`\``,
          inline: false
        });
      }

      embed.setFooter({ text: 'Use /check to check your answer!' });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Error in Codebusters command:', err);
      
      if (err.response && err.response.status === 429) {
        await interaction.editReply({
          content: 'Rate limit exceeded. Please visit https://tinyurl.com/HylasTheCatDocumentation for help.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: 'Command failed. Please visit https://tinyurl.com/HylasTheCatDocumentation for help.',
          ephemeral: true
        });
      }
    }
  }
};
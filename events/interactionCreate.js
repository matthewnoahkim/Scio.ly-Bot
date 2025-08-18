// /events/interactionCreate.js
const { Events } = require('discord.js');
const AnatomyEndocrine = require('../commands/anatomyendocrine'); // <— this file

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (interaction.isButton()) {
        const handled = await AnatomyEndocrine.handleButton(interaction);
        if (handled) return;
      }

      if (interaction.isModalSubmit()) {
        const handled = await AnatomyEndocrine.handleModal(interaction);
        if (handled) return;
      }

      if (!interaction.isChatInputCommand()) return;

      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this interaction!', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error while executing this interaction!', ephemeral: true });
        }
      } catch (e) {
        console.error('Failed to send error reply:', e);
      }
    }
  },
};

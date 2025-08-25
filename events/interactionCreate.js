const { Events, MessageFlags } = require('discord.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(`ERROR executing ${interaction.commandName}:`, error);
			
			const errorMessage = 'Something went wrong while executing this command. Please try again later.';
			
			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
				} else {
					await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
				}
			} catch (replyError) {
				console.error('ERROR: Failed to send error message:', replyError);
			}
		}
	},
};
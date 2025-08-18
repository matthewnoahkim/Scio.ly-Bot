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

		if (interaction.isButton()) {
    		const command = interaction.client.commands.get('anatomyendocrine');
    		if (command && (interaction.customId.includes('check_answer_') || interaction.customId.includes('explain_question_'))) {
        		await command.handleButtonInteraction(interaction);
    		}
		}

		if (interaction.isModalSubmit()) {
    		const command = interaction.client.commands.get('anatomyendocrine');
    		if (command && interaction.customId.startsWith('answer_modal_')) {
       			await command.handleModalSubmit(interaction);
    		}
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			}
		}
	},
};
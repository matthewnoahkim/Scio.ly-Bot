const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Replies with help resources'),
	async execute(interaction) {
		await interaction.reply('Please visit https://scio.ly/docs for more detailed documentation on how to use the bot.\n - `/eventname` - Get a question for an event\n - `/check` - Check your answer to a question\n - `/explain` - Get an AI generated explanation for a question')
	},
};
const { Events, ActivityType } = require('discord.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);
		client.user.setActivity('Science Olympiad questions | scio.ly', {
			type: ActivityType.Playing,
		});
	}
};
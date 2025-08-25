const { Events, ActivityType } = require('discord.js');
const statuses = [
    { name: 'I'},
    { name: 'love'},
    { name: 'SciOly'}
];

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);
		client.user.setActivity('scio.ly', {
			type: ActivityType.Playing,
		});
		let i = 0;
    	setInterval(() => {
        	client.user.setStatus(statuses[i].name);
        	i = (i + 1) % statuses.length;
    	}, 1000);
	}
};
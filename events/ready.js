const { Events, ActivityType } = require('discord.js');

const bubbles = ['I', '❤️', 'SciOly!'];
const INTERVAL_MS = 1000;

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);

    client.user.setPresence({
      activities: [{ name: 'scio.ly', type: ActivityType.Playing }],
      status: 'online'
    });

    let i = 0;
    setInterval(() => {
      client.user.setPresence({
        activities: [{ name: 'scio.ly', type: ActivityType.Playing }],
        status: 'online',
        afk: false,
      });

      client.user.setActivity(bubbles[i], { type: ActivityType.Custom });
      i = (i + 1) % bubbles.length;
    }, INTERVAL_MS);
  },
};

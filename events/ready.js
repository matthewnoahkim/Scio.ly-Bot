const { Events, ActivityType } = require('discord.js');

const pulses = ['I', '❤️', 'SciOly!'];
const INTERVAL_MS = 1000; // 1s — note: frequent updates may hit rate limits

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);

    let i = 0;
    const updatePresence = () => {
      const suffix = pulses[i];
      client.user
        .setActivity(`scio.ly — ${suffix}`, { type: ActivityType.Playing })
        .catch(console.error);
      i = (i + 1) % pulses.length;
    };

    updatePresence();                  // initial: "Playing scio.ly — I"
    setInterval(updatePresence, INTERVAL_MS);
  },
};
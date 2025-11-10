const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);

    client.user.setPresence({
      activities: [{ name: "Science Olympiad", type: 5 }], // type: 5 = Competing
      status: "online"
    });
  }
};
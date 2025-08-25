const { Events } = require('discord.js');

const statuses = ["I", "❤️", "scio.ly"];

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);

    let i = 0;
    setInterval(() => {
      client.user.setPresence({
        activities: [{ name: statuses[i], type: 4 }], // type: 4 = Custom Status
        status: "online"
      });
      i = (i + 1) % statuses.length;
    }, 400);
  }
};
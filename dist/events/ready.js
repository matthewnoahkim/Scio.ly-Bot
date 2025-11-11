"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
exports.default = {
    name: discord_js_1.Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);
        client.user.setPresence({
            activities: [{ name: 'Science Olympiad', type: discord_js_1.ActivityType.Competing }],
            status: 'online',
        });
    },
};

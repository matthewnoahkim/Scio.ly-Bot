import { ActivityType, Events } from 'discord.js';

export default {
	name: Events.ClientReady,
	once: true,
	execute(client: { user: { tag: string; setPresence: (presence: { activities: Array<{ name: string; type: ActivityType }>; status: 'online' | 'idle' | 'dnd' | 'invisible' }) => void }; guilds: { cache: { size: number } } }) {
		console.log(`${client.user.tag} is ready! Serving ${client.guilds.cache.size} servers.`);

		client.user.setPresence({
			activities: [{ name: 'Science Olympiad', type: ActivityType.Competing }],
			status: 'online',
		});
	},
};


import { Events, Interaction, MessageFlags } from 'discord.js';

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const RATE_LIMIT_MAX_REQUESTS = parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 1);
const RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 1_000);
const RATE_LIMIT_BLOCK_DURATION_MS = parsePositiveInt(process.env.RATE_LIMIT_BLOCK_DURATION_MS, 2_000);

interface RateLimitState {
	timestamps: number[];
	blockedUntil: number;
}

const userRateLimitState = new Map<string, RateLimitState>();

export default {
	name: Events.InteractionCreate,
	async execute(interaction: Interaction) {
		if (!interaction.isChatInputCommand()) return;

		const now = Date.now();
		const userId = interaction.user?.id || interaction.member?.user?.id;

		if (userId) {
			const state = userRateLimitState.get(userId) ?? { timestamps: [], blockedUntil: 0 };

			if (state.blockedUntil > now) {
				const remainingSeconds = Math.ceil((state.blockedUntil - now) / 1000);
				const message = `You're sending commands too quickly. Please wait ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} before trying again.`;

				try {
					await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
				}
				catch (error) {
					console.error('ERROR: Failed to send rate limit reply:', error);
				}
				return;
			}

			const earliestAllowed = now - RATE_LIMIT_WINDOW_MS;
			state.timestamps = state.timestamps.filter(timestamp => timestamp > earliestAllowed);

			if (state.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
				state.blockedUntil = now + RATE_LIMIT_BLOCK_DURATION_MS;
				userRateLimitState.set(userId, state);

				const waitSeconds = Math.ceil(RATE_LIMIT_BLOCK_DURATION_MS / 1000);
				const message = `You're sending commands too quickly. Please wait ${waitSeconds} second${waitSeconds === 1 ? '' : 's'} before trying again.`;

				try {
					await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
				}
				catch (error) {
					console.error('ERROR: Failed to send rate limit reply:', error);
				}
				return;
			}

			state.timestamps.push(now);
			state.blockedUntil = 0;
			userRateLimitState.set(userId, state);
		}

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		}
		catch (error) {
			console.error(`ERROR executing ${interaction.commandName}:`, error);

			const errorMessage = 'Something went wrong while executing this command. Please try again later.';

			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
				}
				else {
					await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
				}
			}
			catch (replyError) {
				console.error('ERROR: Failed to send error message:', replyError);
			}
		}
	},
};


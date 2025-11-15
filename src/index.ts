import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Client as DiscordClient, Collection, GatewayIntentBits } from 'discord.js';
import config from '../config.json';
import type { SciOlyCommand } from './shared-command-utils';

declare module 'discord.js' {
	interface Client {
		commands: Collection<string, SciOlyCommand>;
	}
}

interface DiscordEvent {
	name: string;
	once?: boolean;
	execute: (...args: unknown[]) => Promise<void> | void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isSciOlyCommand(value: unknown): value is SciOlyCommand {
	if (!isRecord(value)) return false;
	if (!('data' in value) || !('execute' in value)) return false;
	const candidate = value as { data?: unknown; execute?: unknown };
	return typeof candidate.execute === 'function';
}

function isDiscordEvent(value: unknown): value is DiscordEvent {
	if (!isRecord(value)) return false;
	return typeof value.name === 'string' && typeof value.execute === 'function';
}

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error('ERROR: BOT_TOKEN not found in environment variables');
	process.exit(1);
}

const { port } = config;
const app = express();
app.get('/', (_request, response) => {
	response.sendFile('index.html', { root: path.resolve(__dirname, '..') });
});
app.listen(port, () => console.log(`App listening at http://localhost:${port}`));

const client = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection<string, SciOlyCommand>();

function resolveFiles(directory: string, extension: string): string[] {
	return fs
		.readdirSync(directory)
		.filter(file => file.endsWith(extension))
		.map(file => path.join(directory, file));
}

const isTsRuntime = __filename.endsWith('.ts');
const commandExtension = isTsRuntime ? '.ts' : '.js';
const commandsRoot = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsRoot);

for (const folder of commandFolders) {
	const commandsPath = path.join(commandsRoot, folder);
	if (!fs.statSync(commandsPath).isDirectory()) continue;

	const commandFiles = resolveFiles(commandsPath, commandExtension);

	for (const filePath of commandFiles) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
		const commandModule = require(filePath) as { default?: unknown };
		const maybeCommand = commandModule.default ?? commandModule;
		if (isSciOlyCommand(maybeCommand)) {
			const command = maybeCommand;
			client.commands.set(command.data.name, command);
		}
		else {
			console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = resolveFiles(eventsPath, commandExtension);

for (const filePath of eventFiles) {
	// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
	const eventModule = require(filePath) as { default?: unknown };
	const maybeEvent = eventModule.default ?? eventModule;
	if (!isDiscordEvent(maybeEvent)) {
		console.warn(`[WARNING] The event at ${filePath} is missing required properties.`);
		continue;
	}

	const event = maybeEvent;

	if (event.once) {
		client.once(event.name, (...args: unknown[]) => {
			void event.execute(...args);
		});
	}
	else {
		client.on(event.name, (...args: unknown[]) => {
			void event.execute(...args);
		});
	}
}

void client.login(token);


import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { REST, Routes } from 'discord.js';
import type { SciOlyCommand } from './shared-command-utils';

const clientId = process.env.CLIENT_ID;
const token = process.env.BOT_TOKEN;

if (!clientId || !token) {
	console.error('ERROR: Missing required environment variables: CLIENT_ID and BOT_TOKEN');
	process.exit(1);
}

function resolveCommandFiles(directory: string, extension: string): string[] {
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.flatMap(entry => {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return resolveCommandFiles(entryPath, extension);
			}
			return entry.name.endsWith(extension) ? [entryPath] : [];
		});
}

const isTsRuntime = __filename.endsWith('.ts');
const commandExtension = isTsRuntime ? '.ts' : '.js';
const foldersPath = path.join(__dirname, 'commands');

const commandFiles = resolveCommandFiles(foldersPath, commandExtension);
const commands: unknown[] = [];

for (const filePath of commandFiles) {
	// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
	const commandModule = require(filePath) as { default?: SciOlyCommand };
	const command = commandModule.default ?? commandModule;
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	}
	else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

const rest = new REST().setToken(token);

void (async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		const data = (await rest.put(Routes.applicationCommands(clientId), { body: commands })) as unknown[];

		console.log(`Successfully reloaded ${Array.isArray(data) ? data.length : 0} application (/) commands.`);
	}
	catch (error) {
		console.error(error);
	}
})();


"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
const discord_js_1 = require("discord.js");
const config_json_1 = __importDefault(require("../config.json"));
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isSciOlyCommand(value) {
    if (!isRecord(value))
        return false;
    if (!('data' in value) || !('execute' in value))
        return false;
    const candidate = value;
    return typeof candidate.execute === 'function';
}
function isDiscordEvent(value) {
    if (!isRecord(value))
        return false;
    return typeof value.name === 'string' && typeof value.execute === 'function';
}
const token = process.env.BOT_TOKEN;
if (!token) {
    console.error('ERROR: BOT_TOKEN not found in environment variables');
    process.exit(1);
}
const { port } = config_json_1.default;
const app = (0, express_1.default)();
app.get('/', (_request, response) => {
    response.sendFile('index.html', { root: node_path_1.default.resolve(__dirname, '..') });
});
app.listen(port, () => console.log(`App listening at http://localhost:${port}`));
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
client.commands = new discord_js_1.Collection();
function resolveFiles(directory, extension) {
    return node_fs_1.default
        .readdirSync(directory)
        .filter(file => file.endsWith(extension))
        .map(file => node_path_1.default.join(directory, file));
}
const isTsRuntime = __filename.endsWith('.ts');
const commandExtension = isTsRuntime ? '.ts' : '.js';
const commandsRoot = node_path_1.default.join(__dirname, 'commands');
const commandFolders = node_fs_1.default.readdirSync(commandsRoot);
for (const folder of commandFolders) {
    const commandsPath = node_path_1.default.join(commandsRoot, folder);
    if (!node_fs_1.default.statSync(commandsPath).isDirectory())
        continue;
    const commandFiles = resolveFiles(commandsPath, commandExtension);
    for (const filePath of commandFiles) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const commandModule = require(filePath);
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
const eventsPath = node_path_1.default.join(__dirname, 'events');
const eventFiles = resolveFiles(eventsPath, commandExtension);
for (const filePath of eventFiles) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const eventModule = require(filePath);
    const maybeEvent = eventModule.default ?? eventModule;
    if (!isDiscordEvent(maybeEvent)) {
        console.warn(`[WARNING] The event at ${filePath} is missing required properties.`);
        continue;
    }
    const event = maybeEvent;
    if (event.once) {
        client.once(event.name, (...args) => {
            void event.execute(...args);
        });
    }
    else {
        client.on(event.name, (...args) => {
            void event.execute(...args);
        });
    }
}
void client.login(token);

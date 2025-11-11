"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const discord_js_1 = require("discord.js");
const clientId = process.env.CLIENT_ID;
const token = process.env.BOT_TOKEN;
if (!clientId || !token) {
    console.error('ERROR: Missing required environment variables: CLIENT_ID and BOT_TOKEN');
    process.exit(1);
}
function resolveCommandFiles(directory, extension) {
    return node_fs_1.default
        .readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
        const entryPath = node_path_1.default.join(directory, entry.name);
        if (entry.isDirectory()) {
            return resolveCommandFiles(entryPath, extension);
        }
        return entry.name.endsWith(extension) ? [entryPath] : [];
    });
}
const isTsRuntime = __filename.endsWith('.ts');
const commandExtension = isTsRuntime ? '.ts' : '.js';
const foldersPath = node_path_1.default.join(__dirname, 'commands');
const commandFiles = resolveCommandFiles(foldersPath, commandExtension);
const commands = [];
for (const filePath of commandFiles) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const commandModule = require(filePath);
    const command = commandModule.default ?? commandModule;
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    }
    else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}
const rest = new discord_js_1.REST().setToken(token);
void (async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        const data = (await rest.put(discord_js_1.Routes.applicationCommands(clientId), { body: commands }));
        console.log(`Successfully reloaded ${Array.isArray(data) ? data.length : 0} application (/) commands.`);
    }
    catch (error) {
        console.error(error);
    }
})();
//# sourceMappingURL=deploy-commands.js.map
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
console.log('Environment check:');
console.log('CLIENT_ID exists:', Boolean(clientId));
console.log('BOT_TOKEN exists:', Boolean(token));
console.log('CLIENT_ID length:', clientId?.length ?? 0);
console.log('BOT_TOKEN length:', token?.length ?? 0);
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
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const commandModule = require(filePath);
        const command = commandModule.default ?? commandModule;
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✓ Loaded command: ${command.data.name}`);
        }
        else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
    catch (error) {
        console.error(`[ERROR] Failed to load command from ${filePath}:`, error.message);
    }
}
console.log(`\nFound ${commands.length} commands to deploy.`);
console.log('Commands:', commands.map(c => c.name).join(', '));
const rest = new discord_js_1.REST({ timeout: 60_000 }).setToken(token);
void (async () => {
    try {
        console.log(`\nStarted refreshing ${commands.length} application (/) commands.`);
        console.log('Using Discord API endpoint for application commands...');
        const data = (await rest.put(discord_js_1.Routes.applicationCommands(clientId), { body: commands }));
        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        console.log('Deployed commands:', data.map(c => c.name).join(', '));
    }
    catch (error) {
        const err = error;
        console.error('\n❌ Deployment failed with detailed error:');
        console.error('Error code:', err.code);
        console.error('Error message:', err.message);
        if (err.status) {
            console.error('HTTP Status:', err.status);
        }
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('\n🔧 TROUBLESHOOTING:');
            console.error('1. Check your internet connection');
            console.error('2. Verify your firewall isn\'t blocking HTTPS connections');
            console.error('3. Try running: npm update discord.js');
            console.error('4. Verify your BOT_TOKEN is valid in Discord Developer Portal');
        }
        else if (err.status === 401) {
            console.error('\n🔧 TROUBLESHOOTING:');
            console.error('1. Your BOT_TOKEN may be invalid or expired');
            console.error('2. Regenerate your bot token in Discord Developer Portal');
            console.error('3. Update your .env file with the new token');
        }
        else if (err.status === 403) {
            console.error('\n🔧 TROUBLESHOOTING:');
            console.error('1. Your bot may not have the required permissions');
            console.error('2. Ensure your bot has "applications.commands" scope');
            console.error('3. Check if the CLIENT_ID matches your Discord application');
        }
    }
})();

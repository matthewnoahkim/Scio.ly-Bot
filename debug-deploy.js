require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Get required environment variables
const clientId = process.env.CLIENT_ID;
const token = process.env.BOT_TOKEN;

console.log('Environment check:');
console.log('CLIENT_ID exists:', !!clientId);
console.log('BOT_TOKEN exists:', !!token);
console.log('CLIENT_ID length:', clientId?.length || 0);
console.log('BOT_TOKEN length:', token?.length || 0);

if (!clientId || !token) {
  console.error('ERROR: Missing required environment variables: CLIENT_ID and BOT_TOKEN');
  process.exit(1);
}

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		try {
			const command = require(filePath);
			if ('data' in command && 'execute' in command) {
				commands.push(command.data.toJSON());
				console.log(`✓ Loaded command: ${command.data.name}`);
			} else {
				console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
			}
		} catch (error) {
			console.error(`[ERROR] Failed to load command from ${filePath}:`, error.message);
		}
	}
}

console.log(`\nFound ${commands.length} commands to deploy.`);
console.log('Commands:', commands.map(c => c.name).join(', '));

const rest = new REST({ timeout: 60000 }).setToken(token);

(async () => {
	try {
		console.log(`\nStarted refreshing ${commands.length} application (/) commands.`);
		console.log('Using Discord API endpoint for application commands...');

		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		);

		console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
		console.log('Deployed commands:', data.map(c => c.name).join(', '));
	} catch (error) {
		console.error('\n❌ Deployment failed with detailed error:');
		console.error('Error code:', error.code);
		console.error('Error message:', error.message);
		
		if (error.status) {
			console.error('HTTP Status:', error.status);
		}
		
		if (error.response) {
			console.error('Response data:', error.response.data);
		}
		
		// Provide specific troubleshooting advice
		if (error.code === 'ECONNREFUSED') {
			console.error('\n🔧 TROUBLESHOOTING:');
			console.error('1. Check your internet connection');
			console.error('2. Verify your firewall isn\'t blocking HTTPS connections');
			console.error('3. Try running: npm update discord.js');
			console.error('4. Verify your BOT_TOKEN is valid in Discord Developer Portal');
		} else if (error.status === 401) {
			console.error('\n🔧 TROUBLESHOOTING:');
			console.error('1. Your BOT_TOKEN may be invalid or expired');
			console.error('2. Regenerate your bot token in Discord Developer Portal');
			console.error('3. Update your .env file with the new token');
		} else if (error.status === 403) {
			console.error('\n🔧 TROUBLESHOOTING:');
			console.error('1. Your bot may not have the required permissions');
			console.error('2. Ensure your bot has "applications.commands" scope');
			console.error('3. Check if the CLIENT_ID matches your Discord application');
		}
	}
})();

# Scio.ly Bot Setup Guide

## Prerequisites
- Node.js (v16 or higher)
- Discord Bot Token
- Scio.ly API Key

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory with the following content:

```env
# Discord Bot Configuration
BOT_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here

# Scio.ly API Configuration
SCIO_API_KEY=your_scio_api_key_here
```

### 3. Configure Bot (Alternative)
If you prefer not to use environment variables, you can edit `config.json`:

```json
{
  "token": "your_discord_bot_token_here",
  "clientId": "your_discord_client_id_here"
}
```

### 4. Deploy Commands
```bash
node deploy-commands.js
```

### 5. Test API Connection
```bash
node test-api.js
```

### 6. Start the Bot
```bash
node index.js
```

## Troubleshooting

### Common Issues

1. **"No SCIO_API_KEY found"**
   - Make sure your `.env` file exists and contains the correct API key
   - Check that the API key is valid and has the necessary permissions

2. **"Authentication failed"**
   - Verify your API key is correct
   - Check if the API key has expired
   - Ensure you're using the correct API endpoints

3. **"Grading service did not return a result"**
   - The API might be rate-limited
   - Check the API status at https://scio.ly
   - Try again in a few moments

4. **FRQ questions not working**
   - Run `node test-api.js` to test the grading endpoint
   - Check the console logs for detailed error messages
   - Verify the question format being sent to the API

### Debug Mode
The bot now includes extensive logging. Check your console for messages starting with `[anatomyendocrine]` to see what's happening during question loading and grading.

### API Testing
Use the `test-api.js` script to verify your API key and endpoints are working correctly before running the bot.

## API Endpoints Used

- **Questions**: `GET /api/questions` - Fetches questions from Scio.ly
- **Grading**: `POST /api/gemini/grade-free-responses` - Grades FRQ answers
- **Explanation**: `POST /api/gemini/explain` - Provides question explanations

## Support
If you continue to have issues:
1. Check the console logs for error messages
2. Run the test script to verify API connectivity
3. Verify your API key permissions
4. Check the Scio.ly API documentation for any changes 
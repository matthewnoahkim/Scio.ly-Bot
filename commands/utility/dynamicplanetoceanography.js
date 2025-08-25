const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'dynamicplanetoceanography';
const EVENT_NAME = 'Dynamic Planet - Oceanography';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Ocean Circulation', 'Marine Life', 'Chemistry', 'Geology', 'Climate'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'heredity';
const EVENT_NAME = 'Heredity';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Genetics', 'DNA', 'Proteins', 'Evolution', 'Population Genetics'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
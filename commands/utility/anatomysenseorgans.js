const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'anatomysenseorgans';
const EVENT_NAME = 'Anatomy - Sense Organs';
const DIVISIONS = ['B','C'];
const ALLOWED_SUBTOPICS = ['Eyes','Ears','Nose','Tongue','Skin'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
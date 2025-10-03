const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'potionsandpoisons';
const EVENT_NAME = 'Potions and Poisons';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Toxicology','Pharmacology','Dosage','Symptoms','Antidotes'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
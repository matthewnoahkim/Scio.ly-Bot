const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'astronomy';
const EVENT_NAME = 'Astronomy';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Solar System','Stars','Galaxies','Cosmology','Instruments'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});

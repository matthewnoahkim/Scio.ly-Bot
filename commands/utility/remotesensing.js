const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'remotesensing';
const EVENT_NAME = 'Remote Sensing';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Satellites', 'Imaging', 'Data Analysis', 'Applications', 'Technology'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
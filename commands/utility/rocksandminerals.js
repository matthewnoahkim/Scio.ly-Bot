const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'rocksandminerals';
const EVENT_NAME = 'Rocks and Minerals';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Igneous', 'Sedimentary', 'Metamorphic', 'Mineral Properties', 'Crystal Systems'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
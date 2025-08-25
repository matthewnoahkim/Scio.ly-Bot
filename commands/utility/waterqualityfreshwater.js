const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'waterqualityfreshwater';
const EVENT_NAME = 'Water Quality - Freshwater';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['PH', 'Dissolved Oxygen', 'Nutrients', 'Pollutants', 'Testing'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});

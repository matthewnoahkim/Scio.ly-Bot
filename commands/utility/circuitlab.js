const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'circuitlab';
const EVENT_NAME = 'Circuit Lab';
const DIVISIONS = ['B','C'];
const ALLOWED_SUBTOPICS = ['Circuits','Sensors','Calibration','Design','Troubleshooting'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'metricmastery';
const EVENT_NAME = 'Metric Mastery';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Estimation','Orders of Magnitude','Problem Solving','Scientific Reasoning','Calculations'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
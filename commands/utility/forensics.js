const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'forensics';
const EVENT_NAME = 'Forensics';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Evidence Analysis', 'Fingerprints', 'DNA', 'Toxicology', 'Crime Scene'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
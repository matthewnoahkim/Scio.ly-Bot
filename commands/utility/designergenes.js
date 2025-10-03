const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'designergenes';
const EVENT_NAME = 'Designer Genes';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Genetics','DNA','Proteins','Evolution','Population Genetics'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
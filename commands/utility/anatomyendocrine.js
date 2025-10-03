const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'anatomyendocrine';
const EVENT_NAME = 'Anatomy - Endocrine';
const DIVISIONS = ['B','C'];
const ALLOWED_SUBTOPICS = ['Hormones', 'Glands', 'Regulation', 'Feedback', 'Development'];
const ALLOW_IMAGES = true;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'solarsystem';
const EVENT_NAME = 'Solar System';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Planets','Moons','Asteroids','Comets','Galaxies'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
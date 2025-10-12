const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'materialssciencenanomaterials';
const EVENT_NAME = 'Materials Science - Nanomaterials';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Spectroscopy Techniques','Applications of Nanomaterials','Structure & Chemistry','Surfaces & Interfaces','Optical Properties','Types of Nanomaterials','Mechanical Properties','Thermal Properties','Electrical Properties','Microscopy Techniques'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
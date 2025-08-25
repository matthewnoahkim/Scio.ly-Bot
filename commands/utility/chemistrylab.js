const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'chemistrylab';
const EVENT_NAME = 'Chemistry Lab';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Stoichiometry', 'Equilibrium', 'Periodicity', 'Redox Reactions', 'Aqueous Solutions', 'Acids and Bases', 'Physical Properties', 'Thermodynamics', 'Gas Laws', 'Kinetics', 'Electrochemistry'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
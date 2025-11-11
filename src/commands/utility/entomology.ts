import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'entomology';
const EVENT_NAME = 'Entomology';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Insect Anatomy', 'Life Cycles', 'Behavior', 'Classification', 'Ecology'];
const ALLOW_IMAGES = true;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'potionsandpoisons';
const EVENT_NAME = 'Potions and Poisons';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Toxicology', 'Pharmacology', 'Dosage', 'Symptoms', 'Antidotes'];
const ALLOW_IMAGES = false;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


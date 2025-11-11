import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'diseasedetectives';
const EVENT_NAME = 'Disease Detectives';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Epidemiology', 'Pathogens', 'Prevention', 'Outbreak Investigation', 'Statistics'];
const ALLOW_IMAGES = false;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


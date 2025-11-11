import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'machines';
const EVENT_NAME = 'Machines';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Simple Machines', 'Mechanical Advantage', 'Efficiency', 'Compound Machines', 'Design'];
const ALLOW_IMAGES = false;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


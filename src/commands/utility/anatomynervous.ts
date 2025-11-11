import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'anatomynervous';
const EVENT_NAME = 'Anatomy - Nervous';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Brain', 'Spinal Cord', 'Nerves', 'Reflexes', 'Neurotransmitters'];
const ALLOW_IMAGES = true;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


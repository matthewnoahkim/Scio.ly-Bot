import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'remotesensing';
const EVENT_NAME = 'Remote Sensing';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Satellites', 'Imaging', 'Data Analysis', 'Applications', 'Technology'];
const ALLOW_IMAGES = true;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


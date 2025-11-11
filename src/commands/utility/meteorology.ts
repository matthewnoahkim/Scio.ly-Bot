import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'meteorology';
const EVENT_NAME = 'Meteorology';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Weather Systems', 'Clouds', 'Precipitation', 'Temperature', 'Pressure'];
const ALLOW_IMAGES = false;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


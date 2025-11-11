import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'rocksandminerals';
const EVENT_NAME = 'Rocks and Minerals';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Igneous', 'Sedimentary', 'Metamorphic', 'Mineral Properties', 'Crystal Systems'];
const ALLOW_IMAGES = true;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


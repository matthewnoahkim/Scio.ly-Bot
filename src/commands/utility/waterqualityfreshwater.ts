import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'waterqualityfreshwater';
const EVENT_NAME = 'Water Quality - Freshwater';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['PH', 'Dissolved Oxygen', 'Nutrients', 'Pollutants', 'Testing'];
const ALLOW_IMAGES = true;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


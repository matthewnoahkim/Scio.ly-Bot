import { createSciOlyCommand } from '../../shared-command-utils';

const COMMAND_NAME = 'anatomyendocrine';
const EVENT_NAME = 'Anatomy - Endocrine';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Hormones', 'Glands', 'Regulation', 'Feedback', 'Development'];
const ALLOW_IMAGES = true;

export default createSciOlyCommand({
	commandName: COMMAND_NAME,
	eventName: EVENT_NAME,
	divisions: DIVISIONS,
	allowedSubtopics: ALLOWED_SUBTOPICS,
	allowImages: ALLOW_IMAGES,
});


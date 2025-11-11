"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'diseasedetectives';
const EVENT_NAME = 'Disease Detectives';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Epidemiology', 'Pathogens', 'Prevention', 'Outbreak Investigation', 'Statistics'];
const ALLOW_IMAGES = false;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});
//# sourceMappingURL=diseasedetectives.js.map
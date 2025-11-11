"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'machines';
const EVENT_NAME = 'Machines';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Simple Machines', 'Mechanical Advantage', 'Efficiency', 'Compound Machines', 'Design'];
const ALLOW_IMAGES = false;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});
//# sourceMappingURL=machines.js.map
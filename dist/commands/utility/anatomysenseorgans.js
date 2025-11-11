"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'anatomysenseorgans';
const EVENT_NAME = 'Anatomy - Sense Organs';
const DIVISIONS = ['B', 'C'];
const ALLOWED_SUBTOPICS = ['Eyes', 'Ears', 'Nose', 'Tongue', 'Skin'];
const ALLOW_IMAGES = true;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});
//# sourceMappingURL=anatomysenseorgans.js.map
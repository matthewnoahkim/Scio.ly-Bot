"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'potionsandpoisons';
const EVENT_NAME = 'Potions and Poisons';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Toxicology', 'Pharmacology', 'Dosage', 'Symptoms', 'Antidotes'];
const ALLOW_IMAGES = false;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});
//# sourceMappingURL=potionsandpoisons.js.map
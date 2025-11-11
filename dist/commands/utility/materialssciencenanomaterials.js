"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'materialssciencenanomaterials';
const EVENT_NAME = 'Materials Science - Nanomaterials';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = [
    'Spectroscopy Techniques',
    'Applications of Nanomaterials',
    'Structure & Chemistry',
    'Surfaces & Interfaces',
    'Optical Properties',
    'Types of Nanomaterials',
    'Mechanical Properties',
    'Thermal Properties',
    'Electrical Properties',
    'Microscopy Techniques',
];
const ALLOW_IMAGES = false;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});
//# sourceMappingURL=materialssciencenanomaterials.js.map
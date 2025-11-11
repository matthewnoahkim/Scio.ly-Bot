"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'astronomy';
const EVENT_NAME = 'Astronomy';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Solar System', 'Stars', 'Galaxies', 'Cosmology', 'Instruments'];
const ALLOW_IMAGES = true;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});
//# sourceMappingURL=astronomy.js.map
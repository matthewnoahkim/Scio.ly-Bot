"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'meteorology';
const EVENT_NAME = 'Meteorology';
const DIVISIONS = ['B'];
const ALLOWED_SUBTOPICS = ['Weather Systems', 'Clouds', 'Precipitation', 'Temperature', 'Pressure'];
const ALLOW_IMAGES = false;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});

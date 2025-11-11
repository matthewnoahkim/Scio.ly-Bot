"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_command_utils_1 = require("../../shared-command-utils");
const COMMAND_NAME = 'chemistrylab';
const EVENT_NAME = 'Chemistry Lab';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = [
    'Stoichiometry',
    'Equilibrium',
    'Periodicity',
    'Redox Reactions',
    'Aqueous Solutions',
    'Acids and Bases',
    'Physical Properties',
    'Thermodynamics',
    'Gas Laws',
    'Kinetics',
    'Electrochemistry',
];
const ALLOW_IMAGES = false;
exports.default = (0, shared_command_utils_1.createSciOlyCommand)({
    commandName: COMMAND_NAME,
    eventName: EVENT_NAME,
    divisions: DIVISIONS,
    allowedSubtopics: ALLOWED_SUBTOPICS,
    allowImages: ALLOW_IMAGES,
});

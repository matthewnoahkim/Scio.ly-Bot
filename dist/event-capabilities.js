"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_CAPABILITIES = void 0;
exports.getSupportedDivisions = getSupportedDivisions;
exports.getDefaultDivision = getDefaultDivision;
exports.supportsQuestionType = supportsQuestionType;
exports.getSupportedQuestionTypes = getSupportedQuestionTypes;
exports.supportsID = supportsID;
exports.getFallbackDivision = getFallbackDivision;
exports.getUnsupportedMessage = getUnsupportedMessage;
exports.EVENT_CAPABILITIES = {
    'Anatomy - Endocrine': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
    'Anatomy - Nervous': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
    'Anatomy - Sense Organs': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
    Astronomy: {
        divisions: ['C'],
        questionTypes: { C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'C',
    },
    'Chemistry Lab': {
        divisions: ['C'],
        questionTypes: { C: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'C',
    },
    'Circuit Lab': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
    'Designer Genes': {
        divisions: ['C'],
        questionTypes: { C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'C',
    },
    'Disease Detectives': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'B',
    },
    'Dynamic Planet - Oceanography': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
    Entomology: {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
    Forensics: {
        divisions: ['C'],
        questionTypes: { C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'C',
    },
    Heredity: {
        divisions: ['B'],
        questionTypes: { B: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'B',
    },
    Machines: {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'B',
    },
    'Materials Science - Nanomaterials': {
        divisions: ['C'],
        questionTypes: { C: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'C',
    },
    Meteorology: {
        divisions: ['B'],
        questionTypes: { B: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'B',
    },
    'Metric Mastery': {
        divisions: ['B'],
        questionTypes: { B: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'B',
    },
    'Potions and Poisons': {
        divisions: ['B'],
        questionTypes: { B: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'B',
    },
    'Remote Sensing': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'C',
    },
    'Rocks and Minerals': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
    'Solar System': {
        divisions: ['B'],
        questionTypes: { B: ['mcq', 'frq'] },
        supportsID: false,
        defaultDivision: 'B',
    },
    'Water Quality - Freshwater': {
        divisions: ['B', 'C'],
        questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
        supportsID: true,
        defaultDivision: 'B',
    },
};
function getSupportedDivisions(eventName) {
    const config = exports.EVENT_CAPABILITIES[eventName];
    return config ? config.divisions : ['B', 'C'];
}
function getDefaultDivision(eventName) {
    const config = exports.EVENT_CAPABILITIES[eventName];
    return config ? config.defaultDivision : 'B';
}
function supportsQuestionType(eventName, division, questionType) {
    const config = exports.EVENT_CAPABILITIES[eventName];
    if (!config)
        return false;
    const types = config.questionTypes[division];
    return Array.isArray(types) ? types.includes(questionType) : false;
}
function getSupportedQuestionTypes(eventName, division) {
    const config = exports.EVENT_CAPABILITIES[eventName];
    if (!config)
        return [];
    return config.questionTypes[division] || [];
}
function supportsID(eventName) {
    const config = exports.EVENT_CAPABILITIES[eventName];
    return config ? config.supportsID : false;
}
function getFallbackDivision(eventName, requestedDivision, questionType) {
    const config = exports.EVENT_CAPABILITIES[eventName];
    if (!config)
        return 'B';
    if (supportsQuestionType(eventName, requestedDivision, questionType)) {
        return requestedDivision;
    }
    for (const division of config.divisions) {
        if (supportsQuestionType(eventName, division, questionType)) {
            return division;
        }
    }
    return config.defaultDivision;
}
function getUnsupportedMessage(eventName, division, questionType) {
    const config = exports.EVENT_CAPABILITIES[eventName];
    if (!config)
        return 'This event is not supported.';
    const supportedTypes = config.questionTypes[division] || [];
    const otherDivisions = config.divisions.filter(d => d !== division);
    if (supportedTypes.length === 0) {
        return `Division ${division} is not supported for ${eventName}. Available divisions: ${otherDivisions.join(', ')}.`;
    }
    if (!supportedTypes.includes(questionType)) {
        const availableTypes = supportedTypes.map(t => t.toUpperCase()).join(', ');
        return `Division ${division} ${eventName} only supports: ${availableTypes}. Switching to Division ${getFallbackDivision(eventName, division, questionType)}.`;
    }
    return null;
}
exports.default = {
    EVENT_CAPABILITIES: exports.EVENT_CAPABILITIES,
    getSupportedDivisions,
    getDefaultDivision,
    supportsQuestionType,
    getSupportedQuestionTypes,
    supportsID,
    getFallbackDivision,
    getUnsupportedMessage,
};
//# sourceMappingURL=event-capabilities.js.map
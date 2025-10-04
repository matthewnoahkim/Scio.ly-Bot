// Event capabilities configuration based on API analysis
// This maps each event to its supported divisions and question types

const EVENT_CAPABILITIES = {
  'Anatomy - Endocrine': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  },
  'Anatomy - Nervous': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  },
  'Anatomy - Sense Organs': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  },
  'Astronomy': {
    divisions: ['C'],
    questionTypes: { C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'C'
  },
  'Chemistry Lab': {
    divisions: ['C'],
    questionTypes: { C: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'C'
  },
  'Circuit Lab': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  },
  'Designer Genes': {
    divisions: ['C'],
    questionTypes: { C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'C'
  },
  'Disease Detectives': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'B'
  },
  'Dynamic Planet - Oceanography': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  },
  'Entomology': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  },
  'Forensics': {
    divisions: ['C'],
    questionTypes: { C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'C'
  },
  'Heredity': {
    divisions: ['B'],
    questionTypes: { B: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'B'
  },
  'Machines': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'B'
  },
  'Materials Science - Nanomaterials': {
    divisions: ['C'],
    questionTypes: { C: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'C'
  },
  'Meteorology': {
    divisions: ['B'],
    questionTypes: { B: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'B'
  },
  'Metric Mastery': {
    divisions: ['B'],
    questionTypes: { B: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'B'
  },
  'Potions and Poisons': {
    divisions: ['B'],
    questionTypes: { B: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'B'
  },
  'Remote Sensing': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['frq'], C: ['mcq', 'frq'] }, // B only has FRQ, C has both
    supportsID: true,
    defaultDivision: 'C' // Default to C since it has more options
  },
  'Rocks and Minerals': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  },
  'Solar System': {
    divisions: ['B'],
    questionTypes: { B: ['mcq', 'frq'] },
    supportsID: false,
    defaultDivision: 'B'
  },
  'Water Quality - Freshwater': {
    divisions: ['B', 'C'],
    questionTypes: { B: ['mcq', 'frq'], C: ['mcq', 'frq'] },
    supportsID: true,
    defaultDivision: 'B'
  }
};

/**
 * Get the supported divisions for an event
 */
function getSupportedDivisions(eventName) {
  const config = EVENT_CAPABILITIES[eventName];
  return config ? config.divisions : ['B', 'C'];
}

/**
 * Get the default division for an event
 */
function getDefaultDivision(eventName) {
  const config = EVENT_CAPABILITIES[eventName];
  return config ? config.defaultDivision : 'B';
}

/**
 * Check if a division supports a specific question type
 */
function supportsQuestionType(eventName, division, questionType) {
  const config = EVENT_CAPABILITIES[eventName];
  if (!config || !config.questionTypes[division]) return false;
  return config.questionTypes[division].includes(questionType);
}

/**
 * Get supported question types for a division
 */
function getSupportedQuestionTypes(eventName, division) {
  const config = EVENT_CAPABILITIES[eventName];
  if (!config || !config.questionTypes[division]) return [];
  return config.questionTypes[division];
}

/**
 * Check if an event supports ID questions
 */
function supportsID(eventName) {
  const config = EVENT_CAPABILITIES[eventName];
  return config ? config.supportsID : false;
}

/**
 * Get a fallback division if the requested combination is not supported
 */
function getFallbackDivision(eventName, requestedDivision, questionType) {
  const config = EVENT_CAPABILITIES[eventName];
  if (!config) return 'B';
  
  // If the requested division supports the question type, use it
  if (supportsQuestionType(eventName, requestedDivision, questionType)) {
    return requestedDivision;
  }
  
  // Find a division that supports this question type
  for (const division of config.divisions) {
    if (supportsQuestionType(eventName, division, questionType)) {
      return division;
    }
  }
  
  // Fallback to default division
  return config.defaultDivision;
}

/**
 * Get user-friendly error message for unsupported combinations
 */
function getUnsupportedMessage(eventName, division, questionType) {
  const config = EVENT_CAPABILITIES[eventName];
  if (!config) return 'This event is not supported.';
  
  const supportedTypes = config.questionTypes[division] || [];
  const otherDivisions = config.divisions.filter(d => d !== division);
  
  if (supportedTypes.length === 0) {
    return `Division ${division} is not supported for ${eventName}. Available divisions: ${otherDivisions.join(', ')}.`;
  }
  
  if (!supportedTypes.includes(questionType)) {
    const availableTypes = supportedTypes.map(t => t.toUpperCase()).join(', ');
    return `Division ${division} ${eventName} only supports: ${availableTypes}. Switching to Division ${getFallbackDivision(eventName, division, questionType)}.`;
  }
  
  return null; // No error
}

module.exports = {
  EVENT_CAPABILITIES,
  getSupportedDivisions,
  getDefaultDivision,
  supportsQuestionType,
  getSupportedQuestionTypes,
  supportsID,
  getFallbackDivision,
  getUnsupportedMessage
};
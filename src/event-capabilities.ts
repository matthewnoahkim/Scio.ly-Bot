export interface EventCapability {
	divisions: string[];
	questionTypes: Record<string, string[]>;
	supportsID: boolean;
	defaultDivision: string;
}

export const EVENT_CAPABILITIES: Record<string, EventCapability> = {
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

export function getSupportedDivisions(eventName: string): string[] {
	const config = EVENT_CAPABILITIES[eventName];
	return config ? config.divisions : ['B', 'C'];
}

export function getDefaultDivision(eventName: string): string {
	const config = EVENT_CAPABILITIES[eventName];
	return config ? config.defaultDivision : 'B';
}

export function supportsQuestionType(
	eventName: string,
	division: string,
	questionType: string,
): boolean {
	const config = EVENT_CAPABILITIES[eventName];
	if (!config) return false;
	const types = config.questionTypes[division];
	return Array.isArray(types) ? types.includes(questionType) : false;
}

export function getSupportedQuestionTypes(eventName: string, division: string): string[] {
	const config = EVENT_CAPABILITIES[eventName];
	if (!config) return [];
	return config.questionTypes[division] || [];
}

export function supportsID(eventName: string): boolean {
	const config = EVENT_CAPABILITIES[eventName];
	return config ? config.supportsID : false;
}

export function getFallbackDivision(
	eventName: string,
	requestedDivision: string,
	questionType: string,
): string {
	const config = EVENT_CAPABILITIES[eventName];
	if (!config) return 'B';

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

export function getUnsupportedMessage(
	eventName: string,
	division: string,
	questionType: string,
): string | null {
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

	return null;
}

export default {
	EVENT_CAPABILITIES,
	getSupportedDivisions,
	getDefaultDivision,
	supportsQuestionType,
	getSupportedQuestionTypes,
	supportsID,
	getFallbackDivision,
	getUnsupportedMessage,
};


import axios from 'axios';
import { z } from 'zod';
import { normalizeQuestion } from './lib/question-normalizer';
import {
	ApiEnvelopeSchema,
	ApiQuestion,
	ApiQuestionSchema,
	NormalizedQuestion,
} from './types/question';

interface IdEventConfig {
	divisions: string[];
	idDivision: string;
}

const ID_EVENT_CONFIGS: Record<string, IdEventConfig> = {
	'Anatomy - Nervous': { divisions: ['B/C'], idDivision: 'B/C' },
	'Anatomy - Endocrine': { divisions: ['B/C'], idDivision: 'B/C' },
	'Anatomy - Sense Organs': { divisions: ['B/C'], idDivision: 'B/C' },
	Entomology: { divisions: ['B/C'], idDivision: 'B/C' },
	'Circuit Lab': { divisions: ['B/C'], idDivision: 'B/C' },
	'Rocks and Minerals': { divisions: ['B/C'], idDivision: 'B/C' },
	'Water Quality - Freshwater': { divisions: ['B/C'], idDivision: 'B/C' },
	'Remote Sensing': { divisions: ['B/C'], idDivision: 'B/C' },
	'Dynamic Planet - Oceanography': { divisions: ['B/C'], idDivision: 'B/C' },
	Forensics: { divisions: ['C'], idDivision: 'C' },
	'Designer Genes': { divisions: ['C'], idDivision: 'C' },
	Astronomy: { divisions: ['C'], idDivision: 'C' },
};

export function getDivisions(eventName: string): string[] {
	const config = ID_EVENT_CONFIGS[eventName];
	return config ? config.divisions : ['B', 'C'];
}

export interface QuestionChoice {
	name: string;
	value: string;
}

export function buildQuestionTypeChoices(allowImages: boolean): QuestionChoice[] {
	const choices: QuestionChoice[] = [
		{ name: 'MCQ', value: 'mcq' },
		{ name: 'FRQ', value: 'frq' },
	];

	if (allowImages) {
		choices.push({ name: 'ID', value: 'id' });
	}

	return choices;
}

function extractQuestionList(data: unknown): ApiQuestion[] {
	if (!data) return [];

	if (Array.isArray(data)) {
		const parsed = z.array(ApiQuestionSchema).safeParse(data);
		return parsed.success ? parsed.data : [];
	}

	if (typeof data === 'object' && data !== null) {
		if (Array.isArray((data as { data?: unknown }).data)) {
			const parsed = z.array(ApiQuestionSchema).safeParse((data as { data?: unknown }).data);
			return parsed.success ? parsed.data : [];
		}
	}

	return [];
}

export async function handleIDQuestionLogic(
	eventName: string,
	questionType: string | null | undefined,
	division: string | null | undefined,
	subtopic: string | null | undefined,
	minDifficulty: number | null | undefined,
	maxDifficulty: number | null | undefined,
	authHeaders: Record<string, string>,
): Promise<{ question: NormalizedQuestion | null; isID: boolean }> {
	if (questionType !== 'ID' && questionType !== 'id') {
		return { question: null, isID: false };
	}

	const config = ID_EVENT_CONFIGS[eventName];
	if (!config) {
		throw new Error(`Event '${eventName}' does not support ID questions.`);
	}

	const params: Record<string, unknown> = {
		event: eventName,
		division: config.idDivision,
		limit: 1,
	};

	if (subtopic) params.subtopic = subtopic;
	if (minDifficulty != null) params.difficulty_min = minDifficulty;
	if (maxDifficulty != null) params.difficulty_max = maxDifficulty;

	const response = await axios.get('https://scio.ly/api/id-questions', {
		params,
		timeout: 15000,
		headers: authHeaders,
	});

	const envelopeResult = ApiEnvelopeSchema.safeParse(response.data);
	if (!envelopeResult.success || !envelopeResult.data.success) {
		throw new Error('Failed to fetch identification question.');
	}

	const questionList = extractQuestionList(envelopeResult.data.data);

	if (questionList.length === 0 && subtopic) {
		delete params.subtopic;

		const fallbackResponse = await axios.get('https://scio.ly/api/id-questions', {
			params,
			timeout: 15000,
			headers: authHeaders,
		});

		const fallbackEnvelope = ApiEnvelopeSchema.safeParse(fallbackResponse.data);
		if (!fallbackEnvelope.success || !fallbackEnvelope.data.success) {
			throw new Error('No identification questions found for your filters. Try different filters.');
		}

		const fallbackList = extractQuestionList(fallbackEnvelope.data.data);
		if (fallbackList.length === 0) {
			throw new Error('No identification questions found for your filters. Try different filters.');
		}

		const normalized = normalizeQuestion(fallbackList[0]);
		return { question: normalized, isID: true };
	}

	if (questionList.length === 0) {
		throw new Error('No identification questions found for your filters. Try different filters.');
	}

	const normalized = normalizeQuestion(questionList[0]);

	return { question: normalized, isID: true };
}

export default {
	getDivisions,
	buildQuestionTypeChoices,
	handleIDQuestionLogic,
};


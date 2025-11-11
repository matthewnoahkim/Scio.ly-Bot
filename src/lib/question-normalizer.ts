import {
	AnswerValue,
	AnswerValueSchema,
	ApiQuestion,
	NormalizedQuestion,
} from '../types/question';

export function normalizeAnswers(answers: ApiQuestion['answers']): AnswerValue[] {
	if (answers == null) return [];
	const array = Array.isArray(answers) ? answers : [answers];

	return array
		.map(answer => {
			if (answer == null) return null;
			if (typeof answer === 'number') return answer;
			if (typeof answer === 'string') return answer.trim();
			return null;
		})
		.filter((answer): answer is AnswerValue => {
			const parsed = AnswerValueSchema.safeParse(answer);
			return parsed.success;
		});
}

function normalizeOption(option: unknown): string | null {
	if (option == null) return null;
	const cleaned = String(option).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
	return cleaned.length > 0 ? cleaned : null;
}

export function normalizeQuestion(question: ApiQuestion): NormalizedQuestion {
	const questionText = question.question ?? question.prompt ?? '';
	if (!questionText) {
		throw new Error('Question data is missing text');
	}

	let options: string[] | undefined;
	if (Array.isArray(question.options)) {
		options = question.options
			.map(normalizeOption)
			.filter((opt): opt is string => opt !== null);
	}

	const answers = normalizeAnswers(question.answers);

	return {
		...question,
		question: String(questionText),
		options,
		answers: answers.length > 0 ? answers : undefined,
	};
}


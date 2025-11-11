import { describe, expect, it } from 'vitest';
import { normalizeAnswers, normalizeQuestion } from '../src/lib/question-normalizer';

describe('question-normalizer', () => {
	it('normalizes answers to array of trimmed values', () => {
		const answers = normalizeAnswers([' A ', null, 2]);
		expect(answers).toEqual(['A', 2]);
	});

	it('normalizes question text and options', () => {
		const question = normalizeQuestion({
			id: 'q1',
			question: ' Example ',
			options: [' Option A ', null, ''],
			answers: ['A'],
			subtopics: ['Topic'],
		});

		expect(question.question).toBe(' Example ');
		expect(question.options).toEqual(['Option A']);
		expect(question.answers).toEqual(['A']);
	});

	it('throws when question text missing', () => {
		expect(() =>
			normalizeQuestion({
				id: 'q2',
			}),
		).toThrow('Question data is missing text');
	});
});


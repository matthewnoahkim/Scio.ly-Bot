import { describe, expect, it } from 'vitest';
import {
	buildFullQuestionText,
	extractExplanation,
	letterFromIndex,
	resolveCorrectIndexSimple,
} from '../src/shared-utils';
import type { NormalizedQuestion } from '../src/types/question';

describe('shared-utils', () => {
	it('letterFromIndex returns uppercase letter', () => {
		expect(letterFromIndex(0)).toBe('A');
		expect(letterFromIndex(25)).toBe('Z');
	});

	it('resolveCorrectIndexSimple handles letters and numbers', () => {
		const question: NormalizedQuestion = {
			question: 'What is 2 + 2?',
			options: ['3', '4', '5'],
			answers: ['B'],
		};
		expect(resolveCorrectIndexSimple(question)).toBe(1);

		const numericAnswer: NormalizedQuestion = {
			question: 'Pick first option',
			options: ['First', 'Second'],
			answers: [0],
		};
		expect(resolveCorrectIndexSimple(numericAnswer)).toBe(0);
	});

	it('buildFullQuestionText includes answer choices and correct answer', () => {
		const question: NormalizedQuestion = {
			question: 'Which letter comes first?',
			options: ['A', 'B', 'C'],
			answers: ['A'],
		};
		const text = buildFullQuestionText(question);
		expect(text).toContain('Answer Choices');
		expect(text).toContain('Correct Answer: A');
	});

	it('extractExplanation supports multiple response shapes', () => {
		expect(
			extractExplanation({
				success: true,
				data: { explanation: 'Detailed explanation' },
			}),
		).toBe('Detailed explanation');

		expect(extractExplanation('Raw text explanation')).toBe('Raw text explanation');

		expect(
			extractExplanation({
				success: true,
				text: 'Top-level text',
			}),
		).toBe('Top-level text');
	});
});


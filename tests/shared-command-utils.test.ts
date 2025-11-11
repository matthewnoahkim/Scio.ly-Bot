import { describe, expect, it } from 'vitest';
import {
	MAX_CHOICES,
	buildQuestionEmbed,
	createQuestionComponents,
	handleMCQCheck,
	prune,
	resolveCorrectIndex,
} from '../src/shared-command-utils';
import type { NormalizedQuestion } from '../src/types/question';

describe('shared-command-utils', () => {
	it('prune removes nullish values but keeps falsy numbers', () => {
		const trimmed = prune({
			a: 1,
			b: null,
			c: undefined,
			d: 0,
		});
		expect(trimmed).toEqual({ a: 1, d: 0 });
	});

	it('resolveCorrectIndex handles partial matches and letters', () => {
		const question: NormalizedQuestion = {
			question: 'Select the correct option',
			options: ['Alpha', 'Beta', 'Gamma'],
			answers: ['beta'],
		};
		expect(resolveCorrectIndex(question)).toBe(1);
	});

	it('handleMCQCheck validates input and returns embed', () => {
		const question: NormalizedQuestion = {
			question: 'Capital of France?',
			options: ['Paris', 'London', 'Berlin'],
			answers: ['A'],
		};

		expect(handleMCQCheck(question, 'D')).toEqual({
			error: 'Invalid choice. Please enter a letter between A and C.',
		});

		const result = handleMCQCheck(question, 'A');
		expect('error' in result).toBe(false);
		if ('embed' in result) {
			expect(result.embed.data.fields?.[0]?.value).toContain('Paris');
		}
	});

	it('createQuestionComponents returns two rows of buttons', () => {
		const rows = createQuestionComponents('sample');
		expect(rows).toHaveLength(2);
		const [row1, row2] = rows;
		expect(row1.components).toHaveLength(2);
		expect(row2.components).toHaveLength(1);
	});

	it('buildQuestionEmbed includes question metadata', () => {
		const question: NormalizedQuestion = {
			id: 'q1',
			question: 'Sample question?',
			options: ['Option 1', 'Option 2'],
			answers: ['B'],
			division: 'C',
			difficulty: 0.42,
			subtopics: ['Topic'],
		};

		const embed = buildQuestionEmbed(question, 'Sample Event', false, 15);
		expect(embed.data.title).toBe('Sample Event');
		expect(embed.data.fields).toBeDefined();
		expect(embed.data.footer?.text).toContain('QID');
	});

	it('MAX_CHOICES matches Discord constraint', () => {
		expect(MAX_CHOICES).toBe(25);
	});
});


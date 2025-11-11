"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shared_command_utils_1 = require("../src/shared-command-utils");
(0, vitest_1.describe)('shared-command-utils', () => {
    (0, vitest_1.it)('prune removes nullish values but keeps falsy numbers', () => {
        const trimmed = (0, shared_command_utils_1.prune)({
            a: 1,
            b: null,
            c: undefined,
            d: 0,
        });
        (0, vitest_1.expect)(trimmed).toEqual({ a: 1, d: 0 });
    });
    (0, vitest_1.it)('resolveCorrectIndex handles partial matches and letters', () => {
        const question = {
            question: 'Select the correct option',
            options: ['Alpha', 'Beta', 'Gamma'],
            answers: ['beta'],
        };
        (0, vitest_1.expect)((0, shared_command_utils_1.resolveCorrectIndex)(question)).toBe(1);
    });
    (0, vitest_1.it)('handleMCQCheck validates input and returns embed', () => {
        const question = {
            question: 'Capital of France?',
            options: ['Paris', 'London', 'Berlin'],
            answers: ['A'],
        };
        (0, vitest_1.expect)((0, shared_command_utils_1.handleMCQCheck)(question, 'D')).toEqual({
            error: 'Invalid choice. Please enter a letter between A and C.',
        });
        const result = (0, shared_command_utils_1.handleMCQCheck)(question, 'A');
        (0, vitest_1.expect)('error' in result).toBe(false);
        if ('embed' in result) {
            (0, vitest_1.expect)(result.embed.data.fields?.[0]?.value).toContain('Paris');
        }
    });
    (0, vitest_1.it)('createQuestionComponents returns two rows of buttons', () => {
        const rows = (0, shared_command_utils_1.createQuestionComponents)('sample');
        (0, vitest_1.expect)(rows).toHaveLength(2);
        const [row1, row2] = rows;
        (0, vitest_1.expect)(row1.components).toHaveLength(2);
        (0, vitest_1.expect)(row2.components).toHaveLength(1);
    });
    (0, vitest_1.it)('buildQuestionEmbed includes question metadata', () => {
        const question = {
            id: 'q1',
            question: 'Sample question?',
            options: ['Option 1', 'Option 2'],
            answers: ['B'],
            division: 'C',
            difficulty: 0.42,
            subtopics: ['Topic'],
        };
        const embed = (0, shared_command_utils_1.buildQuestionEmbed)(question, 'Sample Event', false, 15);
        (0, vitest_1.expect)(embed.data.title).toBe('Sample Event');
        (0, vitest_1.expect)(embed.data.fields).toBeDefined();
        (0, vitest_1.expect)(embed.data.footer?.text).toContain('QID');
    });
    (0, vitest_1.it)('MAX_CHOICES matches Discord constraint', () => {
        (0, vitest_1.expect)(shared_command_utils_1.MAX_CHOICES).toBe(25);
    });
});
//# sourceMappingURL=shared-command-utils.test.js.map
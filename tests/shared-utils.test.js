"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shared_utils_1 = require("../src/shared-utils");
(0, vitest_1.describe)('shared-utils', () => {
    (0, vitest_1.it)('letterFromIndex returns uppercase letter', () => {
        (0, vitest_1.expect)((0, shared_utils_1.letterFromIndex)(0)).toBe('A');
        (0, vitest_1.expect)((0, shared_utils_1.letterFromIndex)(25)).toBe('Z');
    });
    (0, vitest_1.it)('resolveCorrectIndexSimple handles letters and numbers', () => {
        const question = {
            question: 'What is 2 + 2?',
            options: ['3', '4', '5'],
            answers: ['B'],
        };
        (0, vitest_1.expect)((0, shared_utils_1.resolveCorrectIndexSimple)(question)).toBe(1);
        const numericAnswer = {
            question: 'Pick first option',
            options: ['First', 'Second'],
            answers: [0],
        };
        (0, vitest_1.expect)((0, shared_utils_1.resolveCorrectIndexSimple)(numericAnswer)).toBe(0);
    });
    (0, vitest_1.it)('buildFullQuestionText includes answer choices and correct answer', () => {
        const question = {
            question: 'Which letter comes first?',
            options: ['A', 'B', 'C'],
            answers: ['A'],
        };
        const text = (0, shared_utils_1.buildFullQuestionText)(question);
        (0, vitest_1.expect)(text).toContain('Answer Choices');
        (0, vitest_1.expect)(text).toContain('Correct Answer: A');
    });
    (0, vitest_1.it)('extractExplanation supports multiple response shapes', () => {
        (0, vitest_1.expect)((0, shared_utils_1.extractExplanation)({
            success: true,
            data: { explanation: 'Detailed explanation' },
        })).toBe('Detailed explanation');
        (0, vitest_1.expect)((0, shared_utils_1.extractExplanation)('Raw text explanation')).toBe('Raw text explanation');
        (0, vitest_1.expect)((0, shared_utils_1.extractExplanation)({
            success: true,
            text: 'Top-level text',
        })).toBe('Top-level text');
    });
});
//# sourceMappingURL=shared-utils.test.js.map
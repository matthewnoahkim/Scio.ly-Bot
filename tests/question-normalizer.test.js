"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const question_normalizer_1 = require("../src/lib/question-normalizer");
(0, vitest_1.describe)('question-normalizer', () => {
    (0, vitest_1.it)('normalizes answers to array of trimmed values', () => {
        const answers = (0, question_normalizer_1.normalizeAnswers)([' A ', null, 2]);
        (0, vitest_1.expect)(answers).toEqual(['A', 2]);
    });
    (0, vitest_1.it)('normalizes question text and options', () => {
        const question = (0, question_normalizer_1.normalizeQuestion)({
            id: 'q1',
            question: ' Example ',
            options: [' Option A ', null, ''],
            answers: ['A'],
            subtopics: ['Topic'],
        });
        (0, vitest_1.expect)(question.question).toBe(' Example ');
        (0, vitest_1.expect)(question.options).toEqual(['Option A']);
        (0, vitest_1.expect)(question.answers).toEqual(['A']);
    });
    (0, vitest_1.it)('throws when question text missing', () => {
        (0, vitest_1.expect)(() => (0, question_normalizer_1.normalizeQuestion)({
            id: 'q2',
        })).toThrow('Question data is missing text');
    });
});
//# sourceMappingURL=question-normalizer.test.js.map
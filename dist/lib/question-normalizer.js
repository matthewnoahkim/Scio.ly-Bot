"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAnswers = normalizeAnswers;
exports.normalizeQuestion = normalizeQuestion;
const question_1 = require("../types/question");
function normalizeAnswers(answers) {
    if (answers == null)
        return [];
    const array = Array.isArray(answers) ? answers : [answers];
    return array
        .map(answer => {
        if (answer == null)
            return null;
        if (typeof answer === 'number')
            return answer;
        if (typeof answer === 'string')
            return answer.trim();
        return null;
    })
        .filter((answer) => {
        const parsed = question_1.AnswerValueSchema.safeParse(answer);
        return parsed.success;
    });
}
function normalizeOption(option) {
    if (option == null)
        return null;
    const cleaned = String(option).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    return cleaned.length > 0 ? cleaned : null;
}
function normalizeQuestion(question) {
    const questionText = question.question ?? question.prompt ?? '';
    if (!questionText) {
        throw new Error('Question data is missing text');
    }
    let options;
    if (Array.isArray(question.options)) {
        options = question.options
            .map(normalizeOption)
            .filter((opt) => opt !== null);
    }
    const answers = normalizeAnswers(question.answers);
    return {
        ...question,
        question: String(questionText),
        options,
        answers: answers.length > 0 ? answers : undefined,
    };
}
//# sourceMappingURL=question-normalizer.js.map
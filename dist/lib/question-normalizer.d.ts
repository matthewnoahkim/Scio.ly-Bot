import { AnswerValue, ApiQuestion, NormalizedQuestion } from '../types/question';
export declare function normalizeAnswers(answers: ApiQuestion['answers']): AnswerValue[];
export declare function normalizeQuestion(question: ApiQuestion): NormalizedQuestion;

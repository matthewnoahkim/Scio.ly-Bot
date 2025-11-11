import { NormalizedQuestion } from './types/question';
export declare function getDivisions(eventName: string): string[];
export interface QuestionChoice {
    name: string;
    value: string;
}
export declare function buildQuestionTypeChoices(allowImages: boolean): QuestionChoice[];
export declare function handleIDQuestionLogic(eventName: string, questionType: string | null | undefined, division: string | null | undefined, subtopic: string | null | undefined, minDifficulty: number | null | undefined, maxDifficulty: number | null | undefined, authHeaders: Record<string, string>): Promise<{
    question: NormalizedQuestion | null;
    isID: boolean;
}>;
declare const _default: {
    getDivisions: typeof getDivisions;
    buildQuestionTypeChoices: typeof buildQuestionTypeChoices;
    handleIDQuestionLogic: typeof handleIDQuestionLogic;
};
export default _default;

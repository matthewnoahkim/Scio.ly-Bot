export interface EventCapability {
    divisions: string[];
    questionTypes: Record<string, string[]>;
    supportsID: boolean;
    defaultDivision: string;
}
export declare const EVENT_CAPABILITIES: Record<string, EventCapability>;
export declare function getSupportedDivisions(eventName: string): string[];
export declare function getDefaultDivision(eventName: string): string;
export declare function supportsQuestionType(eventName: string, division: string, questionType: string): boolean;
export declare function getSupportedQuestionTypes(eventName: string, division: string): string[];
export declare function supportsID(eventName: string): boolean;
export declare function getFallbackDivision(eventName: string, requestedDivision: string, questionType: string): string;
export declare function getUnsupportedMessage(eventName: string, division: string, questionType: string): string | null;
declare const _default: {
    EVENT_CAPABILITIES: Record<string, EventCapability>;
    getSupportedDivisions: typeof getSupportedDivisions;
    getDefaultDivision: typeof getDefaultDivision;
    supportsQuestionType: typeof supportsQuestionType;
    getSupportedQuestionTypes: typeof getSupportedQuestionTypes;
    supportsID: typeof supportsID;
    getFallbackDivision: typeof getFallbackDivision;
    getUnsupportedMessage: typeof getUnsupportedMessage;
};
export default _default;

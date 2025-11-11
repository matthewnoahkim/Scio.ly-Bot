import { z } from 'zod';
export declare const AnswerValueSchema: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
export type AnswerValue = z.infer<typeof AnswerValueSchema>;
export declare const ApiQuestionSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    base52: z.ZodOptional<z.ZodString>;
    question: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    event: z.ZodOptional<z.ZodString>;
    division: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    subtopics: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>, "many">>;
    answers: z.ZodOptional<z.ZodUnion<[z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>, "many">, z.ZodString, z.ZodNumber, z.ZodNull]>>;
    difficulty: z.ZodOptional<z.ZodNumber>;
    imageData: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    updated_at: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    base52: z.ZodOptional<z.ZodString>;
    question: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    event: z.ZodOptional<z.ZodString>;
    division: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    subtopics: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>, "many">>;
    answers: z.ZodOptional<z.ZodUnion<[z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>, "many">, z.ZodString, z.ZodNumber, z.ZodNull]>>;
    difficulty: z.ZodOptional<z.ZodNumber>;
    imageData: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    updated_at: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    base52: z.ZodOptional<z.ZodString>;
    question: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    event: z.ZodOptional<z.ZodString>;
    division: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>;
    subtopics: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    options: z.ZodOptional<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>, "many">>;
    answers: z.ZodOptional<z.ZodUnion<[z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>, "many">, z.ZodString, z.ZodNumber, z.ZodNull]>>;
    difficulty: z.ZodOptional<z.ZodNumber>;
    imageData: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    updated_at: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export type ApiQuestion = z.infer<typeof ApiQuestionSchema>;
export interface NormalizedQuestion extends ApiQuestion {
    question: string;
    options?: string[];
    answers?: AnswerValue[];
}
export declare const ApiEnvelopeSchema: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    data: z.ZodOptional<z.ZodUnknown>;
    message: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    success: z.ZodOptional<z.ZodBoolean>;
    data: z.ZodOptional<z.ZodUnknown>;
    message: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    success: z.ZodOptional<z.ZodBoolean>;
    data: z.ZodOptional<z.ZodUnknown>;
    message: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export type ApiEnvelope<T = unknown> = {
    success?: boolean;
    data?: T;
    message?: string;
    [key: string]: unknown;
};
export declare const DeleteQuestionResponseSchema: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    message: z.ZodOptional<z.ZodString>;
} & {
    data: z.ZodOptional<z.ZodObject<{
        decision: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodOptional<z.ZodString>;
        ai_reasoning: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        decision?: string | undefined;
        reasoning?: string | undefined;
        ai_reasoning?: string | undefined;
    }, {
        decision?: string | undefined;
        reasoning?: string | undefined;
        ai_reasoning?: string | undefined;
    }>>;
    reason: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    success: z.ZodOptional<z.ZodBoolean>;
    message: z.ZodOptional<z.ZodString>;
} & {
    data: z.ZodOptional<z.ZodObject<{
        decision: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodOptional<z.ZodString>;
        ai_reasoning: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        decision?: string | undefined;
        reasoning?: string | undefined;
        ai_reasoning?: string | undefined;
    }, {
        decision?: string | undefined;
        reasoning?: string | undefined;
        ai_reasoning?: string | undefined;
    }>>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    success: z.ZodOptional<z.ZodBoolean>;
    message: z.ZodOptional<z.ZodString>;
} & {
    data: z.ZodOptional<z.ZodObject<{
        decision: z.ZodOptional<z.ZodString>;
        reasoning: z.ZodOptional<z.ZodString>;
        ai_reasoning: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        decision?: string | undefined;
        reasoning?: string | undefined;
        ai_reasoning?: string | undefined;
    }, {
        decision?: string | undefined;
        reasoning?: string | undefined;
        ai_reasoning?: string | undefined;
    }>>;
    reason: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export type DeleteQuestionResponse = z.infer<typeof DeleteQuestionResponseSchema>;
export interface FetchQuestionOptions {
    division?: string | null;
    subtopic?: string | null;
    questionType?: string | null;
    difficultyMin?: number | null;
    difficultyMax?: number | null;
    limit?: number;
}
export interface DeleteQuestionResult {
    success: boolean;
    decision: string;
    reasoning: string;
    raw: DeleteQuestionResponse;
}
export interface ExplanationEnvelope {
    success?: boolean;
    data?: {
        explanation?: string;
        text?: string;
        [key: string]: unknown;
    };
    explanation?: string;
    text?: string;
    message?: string;
    content?: string;
    response?: string;
    result?: string;
    [key: string]: unknown;
}
export declare const ExplanationEnvelopeSchema: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    message: z.ZodOptional<z.ZodString>;
} & {
    data: z.ZodOptional<z.ZodObject<{
        explanation: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        explanation?: string | undefined;
        text?: string | undefined;
    }, {
        explanation?: string | undefined;
        text?: string | undefined;
    }>>;
    explanation: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    response: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    success: z.ZodOptional<z.ZodBoolean>;
    message: z.ZodOptional<z.ZodString>;
} & {
    data: z.ZodOptional<z.ZodObject<{
        explanation: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        explanation?: string | undefined;
        text?: string | undefined;
    }, {
        explanation?: string | undefined;
        text?: string | undefined;
    }>>;
    explanation: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    response: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    success: z.ZodOptional<z.ZodBoolean>;
    message: z.ZodOptional<z.ZodString>;
} & {
    data: z.ZodOptional<z.ZodObject<{
        explanation: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        explanation?: string | undefined;
        text?: string | undefined;
    }, {
        explanation?: string | undefined;
        text?: string | undefined;
    }>>;
    explanation: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    response: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;

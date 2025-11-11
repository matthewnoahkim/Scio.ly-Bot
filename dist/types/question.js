"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExplanationEnvelopeSchema = exports.DeleteQuestionResponseSchema = exports.ApiEnvelopeSchema = exports.ApiQuestionSchema = exports.AnswerValueSchema = void 0;
const zod_1 = require("zod");
exports.AnswerValueSchema = zod_1.z.union([zod_1.z.string(), zod_1.z.number()]);
exports.ApiQuestionSchema = zod_1.z
    .object({
    id: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional(),
    base52: zod_1.z.string().optional(),
    question: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    event: zod_1.z.string().optional(),
    division: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).optional(),
    subtopics: zod_1.z.array(zod_1.z.string()).optional(),
    options: zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.null()])).optional(),
    answers: zod_1.z
        .union([
        zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.null()])),
        zod_1.z.string(),
        zod_1.z.number(),
        zod_1.z.null(),
    ])
        .optional(),
    difficulty: zod_1.z.number().min(0).max(1).optional(),
    imageData: zod_1.z.string().optional(),
    images: zod_1.z.array(zod_1.z.string()).optional(),
    updated_at: zod_1.z.string().optional(),
    created_at: zod_1.z.string().optional(),
})
    .passthrough();
exports.ApiEnvelopeSchema = zod_1.z
    .object({
    success: zod_1.z.boolean().optional(),
    data: zod_1.z.unknown().optional(),
    message: zod_1.z.string().optional(),
})
    .passthrough();
exports.DeleteQuestionResponseSchema = exports.ApiEnvelopeSchema.extend({
    data: zod_1.z
        .object({
        decision: zod_1.z.string().optional(),
        reasoning: zod_1.z.string().optional(),
        ai_reasoning: zod_1.z.string().optional(),
    })
        .optional(),
    reason: zod_1.z.string().optional(),
});
exports.ExplanationEnvelopeSchema = exports.ApiEnvelopeSchema.extend({
    data: zod_1.z
        .object({
        explanation: zod_1.z.string().optional(),
        text: zod_1.z.string().optional(),
    })
        .optional(),
    explanation: zod_1.z.string().optional(),
    text: zod_1.z.string().optional(),
    content: zod_1.z.string().optional(),
    response: zod_1.z.string().optional(),
    result: zod_1.z.string().optional(),
});

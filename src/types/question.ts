import { z } from 'zod';

export const AnswerValueSchema = z.union([z.string(), z.number()]);

export type AnswerValue = z.infer<typeof AnswerValueSchema>;

export const ApiQuestionSchema = z
	.object({
		id: z.union([z.string(), z.number()]).optional(),
		base52: z.string().optional(),
		question: z.string().optional(),
		prompt: z.string().optional(),
		event: z.string().optional(),
		division: z.union([z.string(), z.null()]).optional(),
		subtopics: z.array(z.string()).optional(),
		options: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
		answers: z
			.union([
				z.array(z.union([z.string(), z.number(), z.null()])),
				z.string(),
				z.number(),
				z.null(),
			])
			.optional(),
		difficulty: z.number().min(0).max(1).optional(),
		imageData: z.string().optional(),
		images: z.array(z.string()).optional(),
		updated_at: z.string().optional(),
		created_at: z.string().optional(),
	})
	.passthrough();

export type ApiQuestion = z.infer<typeof ApiQuestionSchema>;

export interface NormalizedQuestion extends ApiQuestion {
	question: string;
	options?: string[];
	answers?: AnswerValue[];
}

export const ApiEnvelopeSchema = z
	.object({
		success: z.boolean().optional(),
		data: z.unknown().optional(),
		message: z.string().optional(),
	})
	.passthrough();

export type ApiEnvelope<T = unknown> = {
	success?: boolean;
	data?: T;
	message?: string;
	[key: string]: unknown;
};

export const DeleteQuestionResponseSchema = ApiEnvelopeSchema.extend({
	data: z
		.object({
			decision: z.string().optional(),
			reasoning: z.string().optional(),
			ai_reasoning: z.string().optional(),
		})
		.optional(),
	reason: z.string().optional(),
});

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

export const ExplanationEnvelopeSchema = ApiEnvelopeSchema.extend({
	data: z
		.object({
			explanation: z.string().optional(),
			text: z.string().optional(),
		})
		.optional(),
	explanation: z.string().optional(),
	text: z.string().optional(),
	content: z.string().optional(),
	response: z.string().optional(),
	result: z.string().optional(),
});


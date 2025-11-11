import axios from 'axios';
import { z } from 'zod';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	ComponentType,
	EmbedBuilder,
	Events,
	Message,
	PartialMessage,
	ModalBuilder,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js';
import { buildQuestionTypeChoices, handleIDQuestionLogic } from './shared-id-utils';
import {
	getDefaultDivision,
	getFallbackDivision,
	getUnsupportedMessage,
	supportsQuestionType,
} from './event-capabilities';
import { normalizeAnswers, normalizeQuestion } from './lib/question-normalizer';
import {
	ApiEnvelopeSchema,
	ApiQuestion,
	ApiQuestionSchema,
	DeleteQuestionResponse,
	DeleteQuestionResponseSchema,
	DeleteQuestionResult,
	FetchQuestionOptions,
	NormalizedQuestion,
} from './types/question';
import { cleanLatexForDiscord, formatExplanationText, getExplanationWithRetry, letterFromIndex } from './shared-utils';

export const PRIMARY_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY;

export const AUTH_HEADERS: Record<string, string> = API_KEY
	? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` }
	: {};

export const COLORS = {
	BLUE: 0x2b90d9,
	GREEN: 0x3fbf7f,
	RED: 0xff5555,
} as const;

export const MAX_CHOICES = 25;

export const DIFFICULTY_MAP = {
	'Very Easy (0-19%)': { min: 0, max: 0.19 },
	'Easy (20-39%)': { min: 0.2, max: 0.39 },
	'Medium (40-59%)': { min: 0.4, max: 0.59 },
	'Hard (60-79%)': { min: 0.6, max: 0.79 },
	'Very Hard (80-100%)': { min: 0.8, max: 1 },
} as const;

export interface SciOlyCommandConfig {
	commandName: string;
	eventName: string;
	divisions: string[];
	allowedSubtopics: string[];
	allowImages?: boolean;
}

export interface SciOlyCommand {
	data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
	execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

type Nullable<T> = T | null | undefined;

function makeSafeId(raw: Nullable<unknown>): string {
	const s = String(raw ?? '').replace(/[^\x20-\x7e]/g, '');
	return s.slice(-48) || 'qid';
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	try {
		return JSON.stringify(error);
	}
	catch {
		return 'Unknown error';
	}
}

function getErrorCode(error: unknown): string | undefined {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		const code = (error as { code?: unknown }).code;
		return typeof code === 'string' ? code : undefined;
	}
	return undefined;
}

export function prune<T extends Record<string, unknown>>(obj: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(obj).filter(([, value]) => value != null && value !== ''),
	) as Partial<T>;
}

export function resolveCorrectIndex(question: NormalizedQuestion): number | null {
	try {
		const { options = [] } = question;
		if (!options.length) return null;

		const normalizedAnswers = normalizeAnswers(question.answers);

		for (const answer of normalizedAnswers) {
			if (typeof answer === 'number' && answer >= 0 && answer < options.length) {
				return answer;
			}

			if (typeof answer === 'string') {
				const trimmed = answer.trim();

				if (trimmed.length === 1) {
					const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
					if (idx >= 0 && idx < options.length) return idx;
				}

				const lower = trimmed.toLowerCase();
				const exact = options.findIndex(opt => String(opt ?? '').trim().toLowerCase() === lower);
				if (exact !== -1) return exact;

				const partial = options.findIndex(opt => {
					const value = String(opt ?? '').trim().toLowerCase();
					return value.includes(lower) || lower.includes(value);
				});
				if (partial !== -1) return partial;
			}
		}

		console.warn('Could not resolve correct index', {
			qid: question?.id,
			answers: question?.answers,
			options,
		});
		return null;
	}
	catch (error: unknown) {
		console.error('resolveCorrectIndex error:', error);
		return null;
	}
}

function formatElapsedTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function buildQuestionEmbed(
	question: NormalizedQuestion,
	eventName: string,
	allowImages = false,
	elapsedSeconds = 0,
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(COLORS.BLUE)
		.setTitle(eventName)
		.setDescription(String(question.question || 'No question text').slice(0, 4096));

	const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

	if (Array.isArray(question.options) && question.options.length) {
		const lines = question.options.map((opt, idx) => `**${letterFromIndex(idx)})** ${String(opt).slice(0, 900)}`);
		let block = '';
		for (const line of lines) {
			const next = block ? `${block}\n${line}` : line;
			if (next.length > 1000) {
				fields.push({
					name: fields.length ? 'Answer Choices (cont.)' : 'Answer Choices',
					value: block,
				});
				block = line;
			}
			else {
				block = next;
			}
		}
		if (block) {
			fields.push({
				name: fields.length ? 'Answer Choices (cont.)' : 'Answer Choices',
				value: block,
			});
		}
	}

	fields.push(
		{ name: 'Division', value: String(question.division ?? '—'), inline: true },
		{
			name: 'Difficulty',
			value: typeof question.difficulty === 'number' ? `${Math.round(question.difficulty * 100)}%` : '—',
			inline: true,
		},
		{
			name: 'Time',
			value: `⏱️ ${formatElapsedTime(elapsedSeconds)}`,
			inline: true,
		},
		{
			name: 'Subtopic(s)',
			value:
				Array.isArray(question.subtopics) && question.subtopics.length
					? question.subtopics.join(', ').slice(0, 1024)
					: 'None',
			inline: true,
		},
	);

	const qid = String(question?.base52 ?? question?.id ?? 'unknown-id');
	embed.addFields(fields).setFooter({ text: `Use the buttons below • QID: ${qid}` });

	if (allowImages) {
		if (question.imageData) {
			embed.setImage(question.imageData);
		}
		else if (Array.isArray(question.images) && question.images.length) {
			embed.setImage(question.images[0]);
		}
	}

	return embed;
}

export function createQuestionComponents(rawId: Nullable<unknown>): ActionRowBuilder<ButtonBuilder>[] {
	const safeId = makeSafeId(rawId);

	const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(`check_${safeId}`).setLabel('Check answer').setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId(`explain_${safeId}`).setLabel('Explain question').setStyle(ButtonStyle.Secondary),
	);

	const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(`delete_${safeId}`).setLabel('Delete question').setStyle(ButtonStyle.Danger),
	);

	return [row1, row2];
}

export function buildDeleteConfirmRow(safeId: string): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(`confirm_yes_${safeId}`).setLabel('Yes, delete it').setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId(`confirm_no_${safeId}`).setLabel('No, keep it').setStyle(ButtonStyle.Secondary),
	);
}

function pickFirstQuestion(data: unknown): unknown {
	if (!data) return null;
	if (Array.isArray(data)) return data[0] ?? null;
	if (typeof data === 'object') {
		if (Array.isArray((data as { questions?: unknown[] }).questions)) {
			return (data as { questions: unknown[] }).questions[0] ?? null;
		}
		if ((data as ApiQuestion).id || (data as ApiQuestion).base52 || (data as ApiQuestion).question) {
			return data;
		}
	}
	return null;
}

export async function deleteQuestion(question: NormalizedQuestion, eventName: string): Promise<DeleteQuestionResult> {
	const body = { question, event: eventName };
	const res = await axios.post(`${PRIMARY_BASE}/api/report/remove`, body, {
		headers: AUTH_HEADERS,
		timeout: 30000,
	});

	const parsed = DeleteQuestionResponseSchema.safeParse(res.data);
	const envelope: DeleteQuestionResponse = parsed.success ? parsed.data : { success: res.status >= 200 && res.status < 300 };

	const success = envelope.success ?? (res.status >= 200 && res.status < 300);
	const decision = envelope.data?.decision ?? (success ? 'Approved' : 'Rejected');
	const reasoning =
		envelope.data?.reasoning ??
		envelope.data?.ai_reasoning ??
		(envelope as { reason?: string }).reason ??
		envelope.message ??
		(success ? 'Removed.' : 'Not removed.');

	return { success, decision, reasoning, raw: envelope };
}

async function fetchWithRetry(url: string, params: Record<string, unknown>, tries = 3) {
	let lastErr: unknown;
	for (let attempt = 1; attempt <= tries; attempt += 1) {
		try {
			return await axios.get(url, { params, timeout: 15000, headers: AUTH_HEADERS });
		}
		catch (error: unknown) {
			lastErr = error;
			const status = (error as { response?: { status?: number } })?.response?.status;
			const code = (error as { code?: string }).code;
			if ((status && (status >= 500 || status === 429)) || code === 'ECONNABORTED') {
				await new Promise(resolve => setTimeout(resolve, attempt * 400));
				continue;
			}
			throw error;
		}
	}
	throw lastErr;
}

export async function fetchQuestion(
	eventName: string,
	options: FetchQuestionOptions = {},
): Promise<NormalizedQuestion> {
	const { division, subtopic, questionType, difficultyMin, difficultyMax, limit = 1 } = options;

	const params = prune({
		event: eventName,
		division,
		subtopic,
		question_type: questionType,
		difficulty_min: difficultyMin,
		difficulty_max: difficultyMax,
		limit,
	});

	const response = await fetchWithRetry(`${PRIMARY_BASE}/api/questions`, params);
	const envelopeResult = ApiEnvelopeSchema.safeParse(response.data);
	if (!envelopeResult.success || envelopeResult.data.success === false) {
		throw new Error('API returned unsuccessful response');
	}

	const questionCandidate = pickFirstQuestion(envelopeResult.data.data);
	let normalizedQuestion: NormalizedQuestion | null = null;

	if (questionCandidate) {
		const questionResult = ApiQuestionSchema.safeParse(questionCandidate);
		if (questionResult.success) {
			normalizedQuestion = normalizeQuestion(questionResult.data);
		}
	}

	if (!normalizedQuestion && subtopic) {
		const fallbackParams = prune({
			event: eventName,
			division,
			question_type: questionType,
			difficulty_min: difficultyMin,
			difficulty_max: difficultyMax,
			limit,
		});
		const fallbackResponse = await fetchWithRetry(`${PRIMARY_BASE}/api/questions`, fallbackParams);
		const fallbackEnvelope = ApiEnvelopeSchema.safeParse(fallbackResponse.data);
		if (fallbackEnvelope.success && fallbackEnvelope.data.success !== false) {
			const fallbackCandidate = pickFirstQuestion(fallbackEnvelope.data.data);
			if (fallbackCandidate) {
				const fallbackQuestion = ApiQuestionSchema.safeParse(fallbackCandidate);
				if (fallbackQuestion.success) {
					normalizedQuestion = normalizeQuestion(fallbackQuestion.data);
				}
			}
		}
	}

	if (!normalizedQuestion) {
		throw new Error('No questions found matching criteria');
	}

	if (!normalizedQuestion.base52 && normalizedQuestion.id != null) {
		try {
			const detail = await axios.get(`${PRIMARY_BASE}/api/questions/${normalizedQuestion.id}`, {
				timeout: 15000,
				headers: AUTH_HEADERS,
			});
			const detailEnvelope = ApiEnvelopeSchema.safeParse(detail.data);
			if (detailEnvelope.success && detailEnvelope.data.success !== false) {
				const detailCandidate = ApiQuestionSchema.safeParse(detailEnvelope.data.data);
				if (detailCandidate.success) {
					normalizedQuestion = normalizeQuestion(detailCandidate.data);
				}
			}
		}
		catch {
			// ignore detail fetch errors
		}
	}

	return normalizedQuestion;
}

export async function handleQuestionImages(
	question: NormalizedQuestion,
	embed: EmbedBuilder,
	allowImages: boolean,
	isID: boolean,
): Promise<Array<{ attachment: Buffer; name: string }>> {
	const files: Array<{ attachment: Buffer; name: string }> = [];
	if (!allowImages) return files;

	const url = question?.imageData || (Array.isArray(question?.images) && question.images[0]);
	if (!url) return files;

	try {
		if (isID) {
			try {
				const imageResponse = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 10000 });
				const buffer = Buffer.from(imageResponse.data);
				const filename = `image_${Date.now()}.jpg`;
				files.push({ attachment: buffer, name: filename });
				embed.setImage(`attachment://${filename}`);
				return files;
			}
			catch {
				// fallback to URL below
			}
		}

		embed.setImage(url);
	}
	catch (error: unknown) {
		console.warn('handleQuestionImages warning:', toErrorMessage(error));
	}
	return files;
}

interface MCQCheckSuccess {
	embed: EmbedBuilder;
	isCorrect: boolean;
}

interface MCQCheckError {
	error: string;
}

export function handleMCQCheck(question: NormalizedQuestion, userAnswer: string): MCQCheckSuccess | MCQCheckError {
	try {
		const options = question.options || [];
		if (!options.length) return { error: 'This question has no options — cannot check as MCQ.' };

		const firstLetter = String(userAnswer).trim().toUpperCase().match(/[A-Z]/)?.[0] ?? '';
		const index = firstLetter ? firstLetter.charCodeAt(0) - 65 : -1;
		if (!(index >= 0 && index < options.length)) {
			return {
				error: `Invalid choice. Please enter a letter between A and ${letterFromIndex(options.length - 1)}.`,
			};
		}

		const correctIndex = resolveCorrectIndex(question);
		if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
			console.error('Invalid correctIndex resolved:', {
				questionId: question.id,
				correctIndex,
				optionsLength: options.length,
				answers: question.answers,
			});
			return { error: 'Unable to determine the correct answer for this question. Please try again.' };
		}

		const isCorrect = index === correctIndex;
		const userOption = options[index];
		const correctOption = options[correctIndex];
		if (!userOption || !correctOption) {
			console.error('Invalid option access:', { questionId: question.id, index, correctIndex, options });
			return { error: 'Question data is corrupted. Please try again.' };
		}

		const embed = new EmbedBuilder()
			.setColor(isCorrect ? COLORS.GREEN : COLORS.RED)
			.setTitle(isCorrect ? 'Correct!' : 'Wrong.')
			.addFields(
				{ name: 'Your answer', value: `**${letterFromIndex(index)})** ${userOption}`, inline: true },
				{ name: 'Correct answer', value: `**${letterFromIndex(correctIndex)})** ${correctOption}`, inline: true },
			);

		return { embed, isCorrect };
	}
	catch (error: unknown) {
		console.error('Error in handleMCQCheck:', error);
		return { error: 'An error occurred while checking your answer. Please try again.' };
	}
}

const GradeEntrySchema = z
	.object({
		score: z.number().optional(),
		percentage: z.number().optional(),
	})
	.passthrough();

const GradeResponseSchema = ApiEnvelopeSchema.extend({
	data: z
		.object({
			grades: z.array(GradeEntrySchema).optional(),
			scores: z.array(z.number()).optional(),
		})
		.optional(),
});

export async function handleFRQGrading(question: NormalizedQuestion, userAnswer: string): Promise<{
	embed: EmbedBuilder;
}> {
	const correctAnswers = Array.isArray(question.answers)
		? question.answers.map(String)
		: typeof question.answers === 'string'
			? [question.answers]
			: [];

	const requestBody = {
		responses: [
			{
				question: question.question,
				correctAnswers,
				studentAnswer: userAnswer,
			},
		],
		gradingInstructions:
			'Be VERY lenient in grading. Award points for: 1) Any mention of key concepts, even with different terminology, 2) Synonyms and related terms (e.g., \'K+ efflux\' = \'K+ moves out\'), 3) Partial answers that show understanding, 4) Different but equivalent phrasings, 5) Detailed explanations that cover the expected concepts. Focus on whether the student understands the core concepts, not exact word matching. Award at least 40% if the answer demonstrates understanding of the main concepts, even if phrased differently.',
	};

	const response = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, requestBody, {
		headers: AUTH_HEADERS,
		timeout: 30000,
	});

	const parsed = GradeResponseSchema.safeParse(response.data);
	const data = parsed.success ? parsed.data.data : undefined;

	const gradeEntry = (data as { grades?: Array<{ score?: number; percentage?: number }> })?.grades?.[0];
	let score: number | null = null;

	if (gradeEntry && typeof gradeEntry.score === 'number') {score = gradeEntry.score;}
	else if (Array.isArray((data as { scores?: number[] })?.scores) && (data as { scores?: number[] }).scores?.[0] != null) {
		score = (data as { scores?: number[] }).scores?.[0] ?? null;
	}
	else if (gradeEntry && typeof gradeEntry.percentage === 'number') {
		score = gradeEntry.percentage / 100;
	}

	if (typeof score !== 'number') {
		throw new Error('Gemini grading service did not return a valid score');
	}

	if (score < 0 || score > 1) score = Math.max(0, Math.min(1, score));

	const percentageScore = Math.round(score * 100);
	const isCorrect = percentageScore >= 50;

	const expectedJoined = correctAnswers.join('; ');

	const embed = new EmbedBuilder()
		.setColor(isCorrect ? COLORS.GREEN : COLORS.RED)
		.setTitle(isCorrect ? 'Likely Correct' : 'Needs Improvement')
		.addFields(
			{ name: 'Score', value: `${percentageScore}%`, inline: true },
			{ name: 'Expected answers', value: expectedJoined || 'No official answers provided', inline: false },
		);

	return { embed };
}

export function createAnswerModal(messageId: string, isMCQ: boolean): ModalBuilder {
	const modal = new ModalBuilder().setCustomId(`check_modal_${messageId}`).setTitle('Submit your answer');

	const label = isMCQ ? 'Your answer (A, B, C, ...)' : 'Your answer';
	const input = new TextInputBuilder()
		.setCustomId('answer_input')
		.setLabel(label)
		.setStyle(isMCQ ? TextInputStyle.Short : TextInputStyle.Paragraph)
		.setRequired(true)
		.setMinLength(1)
		.setMaxLength(isMCQ ? 10 : 1024)
		.setPlaceholder(isMCQ ? 'e.g., A' : 'Type your free-response here');

	modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
	return modal;
}

export function getGradingErrorMessage(error: unknown): string {
	const status = (error as { response?: { status?: number; statusText?: string } })?.response?.status;
	if (status === 429) return 'The grading service is rate-limited right now. Please try again in a moment.';
	if (status && [401, 403].includes(status)) return 'Authentication failed for grading. Check your API key.';
	if (status) {
		const statusText =
			(error as { response?: { statusText?: string } })?.response?.statusText || 'Unknown error';
		return `Grading failed: HTTP ${status} - ${statusText}. Please try again shortly.`;
	}
	return `Grading failed: ${(error as Error)?.message || 'Network or connection error'}. Please try again shortly.`;
}

export function getExplanationErrorMessage(error: unknown): string {
	const status = (error as { response?: { status?: number; statusText?: string } })?.response?.status;
	if (status === 429) return 'The explanation service is rate-limited right now. Please try again in a moment.';
	if (status && [401, 403].includes(status)) return 'Authentication failed for explanation. Check your API key.';
	if (status) {
		const statusText =
			(error as { response?: { statusText?: string } })?.response?.statusText || 'Unknown error';
		return `Could not fetch an explanation: HTTP ${status} - ${statusText}. Please try again shortly.`;
	}
	return `Could not fetch an explanation: ${(error as Error)?.message || 'Network or connection error'}. Please try again shortly.`;
}

export async function handleCheckAnswerInteraction(interaction: ButtonInteraction, question: NormalizedQuestion) {
	try {
		if (!question || !question.question) {
			await interaction.reply({ content: 'Question data is invalid. Please try again.', ephemeral: true });
			return;
		}

		const isMCQ = Array.isArray(question.options) && question.options.length > 0;
		const modal = createAnswerModal(interaction.message.id, Boolean(isMCQ));
		await interaction.showModal(modal);

		try {
			const modalSubmit = await interaction.awaitModalSubmit({
				time: 5 * 60 * 1000,
				filter: i => i.customId === `check_modal_${interaction.message.id}` && i.user.id === interaction.user.id,
			});

			const userAnswer = modalSubmit.fields.getTextInputValue('answer_input').trim();
			if (!userAnswer) {
				await modalSubmit.reply({ content: 'Please provide an answer.', ephemeral: true });
				return;
			}

			if (isMCQ) {
				const result = handleMCQCheck(question, userAnswer);
				if ('error' in result) {
					await modalSubmit.reply({ content: result.error, ephemeral: true });
					return;
				}
				await modalSubmit.reply({ embeds: [result.embed] });
			}
			else {
				await modalSubmit.deferReply();
				try {
					const result = await handleFRQGrading(question, userAnswer);
					await modalSubmit.editReply({ embeds: [result.embed] });
				}
				catch (error: unknown) {
					console.error('FRQ grading error:', error);
					await modalSubmit.editReply({ content: getGradingErrorMessage(error) });
				}
			}
		}
		catch (error: unknown) {
			const code = getErrorCode(error);
			if (code === 'INTERACTION_COLLECTOR_ERROR' || code === '10062') return;
			try {
				await interaction.followUp({
					content: 'Something went wrong with the answer submission. Please try again.',
					ephemeral: true,
				});
			}
			catch {
				// ignore follow-up failure
			}
		}
	}
	catch (error: unknown) {
		console.error('Error in handleCheckAnswerInteraction:', error);
		try {
			await interaction.reply({ content: 'Something went wrong. Please try again.', ephemeral: true });
		}
		catch {
			// ignore
		}
	}
}

export async function handleExplainQuestionInteraction(
	interaction: ButtonInteraction,
	question: NormalizedQuestion,
	eventName: string,
	commandName: string,
) {
	await interaction.deferReply();
	try {
		const explanation = await getExplanationWithRetry(question, eventName, AUTH_HEADERS, commandName);
		const text = explanation || 'No explanation available.';
		const cleanedText = cleanLatexForDiscord(text) ?? text;
		const formattedText = formatExplanationText(cleanedText) ?? cleanedText;

		const embed = new EmbedBuilder().setColor(COLORS.BLUE).setTitle('Explanation');
		const truncated =
			formattedText.length > 4096 ? `${formattedText.substring(0, 4093)}...` : formattedText;
		embed.setDescription(truncated);

		await interaction.editReply({ embeds: [embed] });
	}
	catch (error: unknown) {
		console.error('Error in handleExplainQuestionInteraction:', error);
		const message = getExplanationErrorMessage(error);
		try {
			await interaction.editReply({ content: message });
		}
		catch {
			// ignore
		}
	}
}

export async function handleDeleteQuestionInteraction(
	buttonInteraction: ButtonInteraction,
	question: NormalizedQuestion,
	eventName: string,
) {
	try {
		const safeId = makeSafeId(question.base52 || question.id || buttonInteraction.message.id);
		const confirmRow = buildDeleteConfirmRow(safeId);

		await buttonInteraction.reply({
			content: 'Are you sure you want to delete this question?',
			components: [confirmRow],
			ephemeral: true,
		});

		const collector = buttonInteraction.channel?.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 15_000,
			filter: i => i.user.id === buttonInteraction.user.id && i.customId.startsWith('confirm_'),
		});

		if (!collector) {
			await buttonInteraction.editReply({ content: 'Unable to confirm deletion at this time.', components: [] });
			return;
		}

		const decision = await new Promise<'yes' | 'no' | 'timeout'>(resolve => {
			const timeout = setTimeout(() => resolve('timeout'), 15_000);
			collector.on('collect', interaction => {
				void (async () => {
					if (interaction.customId === `confirm_yes_${safeId}`) {
						clearTimeout(timeout);
						collector.stop('confirmed');
						try {
							await interaction.update({ content: 'Deleting question...', components: [] });
						}
						catch (error: unknown) {
							console.error('Failed to update confirmation interaction:', error);
						}
						resolve('yes');
					}
					else if (interaction.customId === `confirm_no_${safeId}`) {
						clearTimeout(timeout);
						collector.stop('cancelled');
						try {
							await interaction.update({ content: 'Deletion cancelled.', components: [] });
						}
						catch (error: unknown) {
							console.error('Failed to update cancellation interaction:', error);
						}
						resolve('no');
					}
				})();
			});
			collector.on('end', (_, reason) => {
				if (reason === 'time') {
					clearTimeout(timeout);
					resolve('timeout');
				}
			});
		});

		if (decision !== 'yes') {
			if (decision === 'timeout') {
				await buttonInteraction.editReply({ content: 'Timed out waiting for confirmation.', components: [] });
			}
			return;
		}

		const result = await deleteQuestion(question, eventName);

		const responseEmbed = new EmbedBuilder()
			.setColor(result.success ? COLORS.GREEN : COLORS.RED)
			.setTitle(result.success ? 'Question deleted' : 'Deletion rejected')
			.addFields(
				{ name: 'AI decision', value: String(result.decision) },
				{ name: 'AI reasoning', value: String(result.reasoning).slice(0, 1024) },
			);

		await buttonInteraction.followUp({ embeds: [responseEmbed], ephemeral: true });

		if (result.success && buttonInteraction.message instanceof Message) {
			try {
				await buttonInteraction.message.edit({ components: [] });
			}
			catch (error: unknown) {
				console.error('Failed to disable public buttons after deletion:', error);
			}
		}

		try {
			await buttonInteraction.editReply({ components: [] });
		}
		catch {
			// ignore
		}
	}
	catch (error: unknown) {
		console.error('handleDeleteQuestionInteraction error:', error);
		try {
			if (!buttonInteraction.replied && !buttonInteraction.deferred) {
				await buttonInteraction.reply({
					content: 'Something went wrong. Please try again.',
					ephemeral: true,
				});
			}
			else {
				await buttonInteraction.followUp({
					content: 'Something went wrong. Please try again.',
					ephemeral: true,
				});
			}
		}
		catch {
			// ignore
		}
	}
}

export function createSciOlyCommand(config: SciOlyCommandConfig): SciOlyCommand {
	const { commandName, eventName, divisions, allowedSubtopics, allowImages = false } = config;

	const builder = new SlashCommandBuilder()
		.setName(commandName)
		.setDescription(`Get a ${eventName} question`)
		.addStringOption(option =>
			option
				.setName('question_type')
				.setDescription('Question type')
				.setRequired(false)
				.addChoices(...(buildQuestionTypeChoices(allowImages).slice(0, MAX_CHOICES) || [])),
		)
		.addStringOption(option =>
			option
				.setName('division')
				.setDescription('Division')
				.setRequired(false)
				.addChoices(
					...((divisions || []).slice(0, MAX_CHOICES).map(d => ({
						name: `Division ${d}`,
						value: d,
					})) || []),
				),
		)
		.addStringOption(option =>
			option
				.setName('difficulty')
				.setDescription('Difficulty')
				.setRequired(false)
				.addChoices(
					...Object.keys(DIFFICULTY_MAP)
						.slice(0, MAX_CHOICES)
						.map(d => ({ name: d, value: d })),
				),
		)
		.addStringOption(option =>
			option
				.setName('subtopic')
				.setDescription('Subtopic')
				.setRequired(false)
				.addChoices(
					...((allowedSubtopics || []).slice(0, MAX_CHOICES).map(s => ({
						name: String(s).slice(0, 100),
						value: String(s).slice(0, 100),
					})) || []),
				),
		);

	return {
		data: builder,
		async execute(interaction: ChatInputCommandInteraction) {
			try {
				await interaction.deferReply();

				let division = interaction.options.getString('division') || getDefaultDivision(eventName);
				const subtopic = interaction.options.getString('subtopic');
				const questionType = interaction.options.getString('question_type');
				const difficultyLevel = interaction.options.getString('difficulty');
				const difficulty = difficultyLevel ? (DIFFICULTY_MAP as Record<string, { min: number; max: number }>)[difficultyLevel] : null;

				if (questionType && !supportsQuestionType(eventName, division, questionType)) {
					const fallbackDivision = getFallbackDivision(eventName, division, questionType);
					const unsupportedMessage = getUnsupportedMessage(eventName, division, questionType);
					if (fallbackDivision !== division && unsupportedMessage) {
						division = fallbackDivision;
						await interaction.followUp({ content: unsupportedMessage, ephemeral: true });
					}
				}

				let question: NormalizedQuestion;
				let isID = false;

				if (questionType === 'id') {
					try {
						const result = await handleIDQuestionLogic(
							eventName,
							questionType,
							division,
							subtopic,
							difficulty?.min ?? null,
							difficulty?.max ?? null,
							AUTH_HEADERS,
						);
						if (!result.question) {
							await interaction.editReply('No identification questions found for your filters. Try different filters.');
							return;
						}
						question = result.question;
						isID = result.isID;
					}
					catch {
						question = await fetchQuestion(eventName, {
							division,
							subtopic,
							questionType: 'mcq',
							difficultyMin: difficulty?.min ?? null,
							difficultyMax: difficulty?.max ?? null,
						});
						isID = false;
					}
				}
				else {
					question = await fetchQuestion(eventName, {
						division,
						subtopic,
						questionType,
						difficultyMin: difficulty?.min ?? null,
						difficultyMax: difficulty?.max ?? null,
					});
				}

				if (!question?.question) {
					await interaction.editReply('Question data is incomplete. Please try again.');
					return;
				}

				const embed = buildQuestionEmbed(question, eventName, allowImages, 0);
				const files = await handleQuestionImages(question, embed, allowImages, isID);

				const safeId = makeSafeId(question.base52 || question.id || interaction.id);
				const components = createQuestionComponents(safeId);

				const sent = await interaction.editReply({
					embeds: [embed],
					components,
					...(files.length > 0 && { files }),
				});

				const startTime = Date.now();
				let timerInterval: NodeJS.Timeout | null = null;

				const updateTimer = async () => {
					try {
						const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
						const updatedEmbed = buildQuestionEmbed(question, eventName, allowImages, elapsedSeconds);
						await sent.edit({
							embeds: [updatedEmbed],
							components: sent.components,
							...(files.length > 0 && { files }),
						});
					}
					catch {
						if (timerInterval) {
							clearInterval(timerInterval);
							timerInterval = null;
						}
					}
				};

				timerInterval = setInterval(() => {
					void updateTimer();
				}, 2000);

				const collector = sent.createMessageComponentCollector({
					componentType: ComponentType.Button,
					time: 30 * 60 * 1000,
					filter: i => i.message.id === sent.id,
				});

				const onDelete = (msg: Message<boolean> | PartialMessage) => {
					if (msg.id && msg.id === sent.id) {
						collector.stop('message_deleted');
						interaction.client.off('messageDelete', onDelete);
						if (timerInterval) {
							clearInterval(timerInterval);
							timerInterval = null;
						}
					}
				};

				interaction.client.on(Events.MessageDelete, onDelete);
				collector.on('end', () => {
					interaction.client.off(Events.MessageDelete, onDelete);
					if (timerInterval) {
						clearInterval(timerInterval);
						timerInterval = null;
					}
				});

				collector.on('collect', buttonInteraction => {
					void (async () => {
						try {
							if (buttonInteraction.user.id !== interaction.user.id) {
								await buttonInteraction.reply({
									content: 'Only the original requester can use these buttons.',
									ephemeral: true,
								});
								return;
							}

							const customId = buttonInteraction.customId;
							if (customId === `check_${safeId}`) {
								await handleCheckAnswerInteraction(buttonInteraction, question);
							}
							else if (customId === `explain_${safeId}`) {
								await handleExplainQuestionInteraction(buttonInteraction, question, eventName, commandName);
							}
							else if (customId === `delete_${safeId}`) {
								await handleDeleteQuestionInteraction(buttonInteraction, question, eventName);
							}
						}
						catch (error: unknown) {
							console.error('Button interaction error:', error);
							try {
								if (!buttonInteraction.replied && !buttonInteraction.deferred) {
									await buttonInteraction.reply({
										content: 'Something went wrong handling that action.',
										ephemeral: true,
									});
								}
							}
							catch (replyError: unknown) {
								console.error('Failed to send error reply:', replyError);
							}
						}
					})();
				});
			}
			catch (error: unknown) {
				console.error(`${commandName} command error:`, error);
				const messageText = error instanceof Error ? error.message : '';
				const errorMessage = messageText.includes('rate limit')
					? 'Rate limit exceeded. Please try again in a few moments.'
					: 'Command failed. Please try again later.';
				await interaction.editReply(errorMessage);
			}
		},
	};
}

export default {
	COLORS,
	AUTH_HEADERS,
	PRIMARY_BASE,
	DIFFICULTY_MAP,
	prune,
	normalizeAnswers,
	resolveCorrectIndex,
	buildQuestionEmbed,
	createQuestionComponents,
	buildDeleteConfirmRow,
	pickFirstQuestion,
	fetchQuestion,
	handleQuestionImages,
	handleMCQCheck,
	handleFRQGrading,
	createAnswerModal,
	letterFromIndex,
	getExplanationWithRetry,
	getGradingErrorMessage,
	getExplanationErrorMessage,
	handleCheckAnswerInteraction,
	handleExplainQuestionInteraction,
	deleteQuestion,
	handleDeleteQuestionInteraction,
	createSciOlyCommand,
};


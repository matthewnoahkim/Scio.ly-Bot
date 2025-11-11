import axios from 'axios';
import {
	AnswerValueSchema,
	ExplanationEnvelope,
	ExplanationEnvelopeSchema,
	NormalizedQuestion,
} from './types/question';

const BASE = 'https://scio.ly';

export function letterFromIndex(idx: number): string {
	return String.fromCharCode(65 + idx);
}

export function resolveCorrectIndexSimple(question: NormalizedQuestion): number | null {
	const { options = [] } = question || {};
	if (!options.length) return null;

	const answers = Array.isArray(question.answers) ? question.answers : [question.answers].filter(
		(value): value is NonNullable<typeof value> => value != null,
	);

	for (const answer of answers) {
		if (answer == null) continue;

		if (typeof answer === 'number') {
			if (answer >= 0 && answer < options.length) {
				return answer;
			}
		}

		if (typeof answer === 'string') {
			const trimmed = answer.trim();

			if (trimmed.length === 1) {
				const letter = trimmed.toUpperCase();
				const letterIndex = letter.charCodeAt(0) - 65;
				if (letterIndex >= 0 && letterIndex < options.length) return letterIndex;
			}

			const lowerTrimmed = trimmed.toLowerCase();
			const index = options.findIndex(opt => {
				if (opt == null) return false;
				const optStr = String(opt).trim().toLowerCase();
				return optStr === lowerTrimmed;
			});
			if (index !== -1) return index;
		}
	}

	return 0;
}

export function cleanLatexForDiscord(text: string | null | undefined): string | null | undefined {
	if (!text || typeof text !== 'string') return text;

	return text
		.replace(/\\boxed\{([^}]+)\}/g, '**$1**')
		.replace(/\\text\{([^}]+)\}/g, '$1')
		.replace(/\\mathrm\{([^}]+)\}/g, '$1')
		.replace(/\\mathbf\{([^}]+)\}/g, '**$1**')
		.replace(/\\mathit\{([^}]+)\}/g, '*$1*')
		.replace(/\\underline\{([^}]+)\}/g, '__$1__')
		.replace(/\\overline\{([^}]+)\}/g, '~~$1~~')
		.replace(/([a-zA-Z])\\([a-zA-Z])/g, '$1 $2')
		.replace(/[ \t]+/g, ' ')
		.replace(/\*\*([^*]+)\*\*/g, '**$1**')
		.replace(/\*([^*]+)\*/g, '*$1*')
		.replace(/__([^_]+)__/g, '__$1__');
}

export function formatExplanationText(text: string | null | undefined): string | null | undefined {
	if (!text || typeof text !== 'string') return text;
	return text.trim();
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
	if (Array.isArray(value)) return value.filter((item): item is T => item != null);
	if (value == null) return [];
	return [value];
}

export function buildFullQuestionText(question: NormalizedQuestion): string {
	let fullText = question.question || question.prompt || '';

	if (fullText.length < 10) {
		let reconstructedQuestion = '';

		if (question.subtopics && question.subtopics.length > 0) {
			reconstructedQuestion += `This is a ${question.event || 'Science Olympiad'} question about ${question.subtopics.join(', ')}.`;
		}

		if (fullText.trim()) {
			reconstructedQuestion += ` ${fullText.trim()}`;
		}

		const answers = ensureArray(question.answers).map(String);
		if (answers.length > 0) {
			reconstructedQuestion += ` The expected answer is: ${answers.join(', ')}`;
		}

		if (reconstructedQuestion) {
			fullText = reconstructedQuestion;
		}
		else {
			fullText = `This is a ${question.event || 'Science Olympiad'} question that needs explanation.`;
		}
	}

	if (Array.isArray(question.options) && question.options.length > 0) {
		const answerChoices = question.options
			.map((opt, i) => `\n${letterFromIndex(i)}) ${opt}`)
			.join('');
		fullText += '\n\nAnswer Choices:' + answerChoices;

		const answers = ensureArray(question.answers).filter(value => {
			const parsed = AnswerValueSchema.safeParse(value);
			return parsed.success;
		});

		if (answers.length > 0) {
			const correctIndex = resolveCorrectIndexSimple({
				...question,
				answers,
			});
			if (
				correctIndex !== null &&
				correctIndex >= 0 &&
				correctIndex < question.options.length
			) {
				const correctLetter = letterFromIndex(correctIndex);
				const correctOption = question.options[correctIndex];
				fullText += `\n\nCorrect Answer: ${correctLetter}) ${correctOption}`;
			}
		}
	}
	else {
		if (!fullText.toLowerCase().includes('question')) {
			fullText = `Question: ${fullText}`;
		}

		const answers = ensureArray(question.answers).map(String);
		if (answers.length > 0) {
			fullText += `\n\nNote: This is a free response question. Expected answer(s): ${answers.join(', ')}`;
		}
		else {
			fullText += '\n\nNote: This is a free response question requiring a detailed explanation.';
		}
	}

	return fullText;
}

export function buildTutorPrompt(questionText: string, eventName: string): string {
	const prompt = `You are an expert Science Olympiad tutor specializing in ${eventName}. Your task is to provide a clear, educational explanation for the following question.

${questionText}

Instructions:
- Provide a concise but complete step-by-step explanation (aim for 200-400 words)
- If this is a multiple choice question, analyze each answer choice and explain why the correct answer is right and why the others are wrong
- If a correct answer is provided, use that as the definitive correct answer in your explanation
- If this is a free response question, provide a comprehensive explanation that covers all key concepts and expected points
- Use clear scientific terminology and explain any complex concepts
- Format your response to be educational and engaging for high school students
- Focus on teaching the underlying science, not just giving the answer
- Keep your response concise to avoid truncation in Discord
- Use proper line breaks and spacing to make your explanation readable:
  * Add line breaks between major sections
  * Use bullet points (*) for lists
  * Separate steps with line breaks
  * Use clear paragraph breaks
- For mathematical expressions, use simple formatting that works in Discord:
  * Use **bold** for emphasis instead of \\boxed{}
  * Use *italic* for variables instead of \\mathit{}
  * Use regular text for subscripts (e.g., H₂ instead of H_2)
  * Avoid complex LaTeX commands that don't render properly in Discord

Please provide your explanation:`;

	return prompt;
}

export function extractExplanation(responseData: unknown): string | null {
	if (typeof responseData === 'string') {
		return responseData;
	}

	const parsed = ExplanationEnvelopeSchema.safeParse(responseData);
	if (!parsed.success) {
		return null;
	}

	const envelope: ExplanationEnvelope = parsed.data;
	if (envelope.data?.explanation) return envelope.data.explanation;
	if (envelope.data?.text) return envelope.data.text;
	if (envelope.explanation) return envelope.explanation;
	if (envelope.text) return envelope.text;
	if (envelope.message) return envelope.message;
	if (envelope.content) return envelope.content;
	if (envelope.response) return envelope.response;
	if (envelope.result) return envelope.result;

	return null;
}

export async function callGeminiThroughScioLy(
	question: NormalizedQuestion,
	eventName: string,
	userAnswer: string | null,
	authHeaders: Record<string, string>,
	logPrefix = 'shared',
): Promise<string> {
	const formattedQuestion = {
		...question,
		question: buildFullQuestionText(question),
	};

	const requestBody = {
		question: formattedQuestion,
		event: eventName,
		userAnswer: userAnswer || null,
	};

	try {
		const response = await axios.post(`${BASE}/api/gemini/explain`, requestBody, {
			headers: {
				'Content-Type': 'application/json',
				...authHeaders,
			},
			timeout: 30000,
		});

		const responseText = extractExplanation(response.data);
		if (!responseText) {
			throw new Error('No explanation text found in scio.ly response');
		}

		return responseText;
	}
	catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[${logPrefix}] scio.ly API error:`, message);
		throw error;
	}
}

export async function getExplanationWithRetry(
	question: NormalizedQuestion,
	eventName: string,
	authHeaders: Record<string, string>,
	logPrefix = 'shared',
): Promise<string> {
	const actualQuestionText = question.question || '';
	const questionKeywords = actualQuestionText
		.toLowerCase()
		.split(/\s+/)
		.filter(word => word.length > 3);

	let retryCount = 0;
	const maxRetries = 3;

	while (retryCount <= maxRetries) {
		try {
			const explanation = await callGeminiThroughScioLy(
				question,
				eventName,
				null,
				authHeaders,
				logPrefix,
			);

			if (
				explanation &&
				!explanation.includes('I apologize, but you have not provided a question') &&
				!explanation.includes('question itself was not provided') &&
				!explanation.includes('Please provide the') &&
				explanation.length > 50
			) {
				const explanationLower = explanation.toLowerCase();
				const matchingKeywords = questionKeywords.filter(keyword =>
					explanationLower.includes(keyword),
				);

				const keywordMatchPercentage =
					questionKeywords.length > 0
						? matchingKeywords.length / questionKeywords.length
						: 1;

				if (questionKeywords.length > 0 && keywordMatchPercentage < 0.05 && actualQuestionText.length > 20) {
					if (retryCount < maxRetries) {
						await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
						retryCount += 1;
						continue;
					}
				}

				return explanation;
			}

			if (retryCount < maxRetries) {
				await new Promise(resolve => setTimeout(resolve, 1500 * (retryCount + 1)));
				retryCount += 1;
				continue;
			}

			break;
		}
		catch (error) {
			if (retryCount < maxRetries) {
				retryCount += 1;
				await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
				continue;
			}
		}
	}

	return 'The API returned an error message. This might be due to rate limiting or temporary issues. Please try again in a moment.';
}

export default {
	letterFromIndex,
	resolveCorrectIndexSimple,
	cleanLatexForDiscord,
	formatExplanationText,
	buildFullQuestionText,
	buildTutorPrompt,
	extractExplanation,
	getExplanationWithRetry,
	callGeminiThroughScioLy,
};


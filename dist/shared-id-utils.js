"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDivisions = getDivisions;
exports.buildQuestionTypeChoices = buildQuestionTypeChoices;
exports.handleIDQuestionLogic = handleIDQuestionLogic;
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const question_normalizer_1 = require("./lib/question-normalizer");
const question_1 = require("./types/question");
const ID_EVENT_CONFIGS = {
    'Anatomy - Nervous': { divisions: ['B/C'], idDivision: 'B/C' },
    'Anatomy - Endocrine': { divisions: ['B/C'], idDivision: 'B/C' },
    'Anatomy - Sense Organs': { divisions: ['B/C'], idDivision: 'B/C' },
    Entomology: { divisions: ['B/C'], idDivision: 'B/C' },
    'Circuit Lab': { divisions: ['B/C'], idDivision: 'B/C' },
    'Rocks and Minerals': { divisions: ['B/C'], idDivision: 'B/C' },
    'Water Quality - Freshwater': { divisions: ['B/C'], idDivision: 'B/C' },
    'Remote Sensing': { divisions: ['B/C'], idDivision: 'B/C' },
    'Dynamic Planet - Oceanography': { divisions: ['B/C'], idDivision: 'B/C' },
    Forensics: { divisions: ['C'], idDivision: 'C' },
    'Designer Genes': { divisions: ['C'], idDivision: 'C' },
    Astronomy: { divisions: ['C'], idDivision: 'C' },
};
function getDivisions(eventName) {
    const config = ID_EVENT_CONFIGS[eventName];
    return config ? config.divisions : ['B', 'C'];
}
function buildQuestionTypeChoices(allowImages) {
    const choices = [
        { name: 'MCQ', value: 'mcq' },
        { name: 'FRQ', value: 'frq' },
    ];
    if (allowImages) {
        choices.push({ name: 'ID', value: 'id' });
    }
    return choices;
}
function extractQuestionList(data) {
    if (!data)
        return [];
    if (Array.isArray(data)) {
        const parsed = zod_1.z.array(question_1.ApiQuestionSchema).safeParse(data);
        return parsed.success ? parsed.data : [];
    }
    if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data.data)) {
            const parsed = zod_1.z.array(question_1.ApiQuestionSchema).safeParse(data.data);
            return parsed.success ? parsed.data : [];
        }
    }
    return [];
}
async function handleIDQuestionLogic(eventName, questionType, division, subtopic, minDifficulty, maxDifficulty, authHeaders) {
    if (questionType !== 'ID' && questionType !== 'id') {
        return { question: null, isID: false };
    }
    const config = ID_EVENT_CONFIGS[eventName];
    if (!config) {
        throw new Error(`Event '${eventName}' does not support ID questions.`);
    }
    const params = {
        event: eventName,
        division: config.idDivision,
        limit: 1,
    };
    if (subtopic)
        params.subtopic = subtopic;
    if (minDifficulty != null)
        params.difficulty_min = minDifficulty;
    if (maxDifficulty != null)
        params.difficulty_max = maxDifficulty;
    const response = await axios_1.default.get('https://scio.ly/api/id-questions', {
        params,
        timeout: 15000,
        headers: authHeaders,
    });
    const envelopeResult = question_1.ApiEnvelopeSchema.safeParse(response.data);
    if (!envelopeResult.success || !envelopeResult.data.success) {
        throw new Error('Failed to fetch identification question.');
    }
    const questionList = extractQuestionList(envelopeResult.data.data);
    if (questionList.length === 0 && subtopic) {
        delete params.subtopic;
        const fallbackResponse = await axios_1.default.get('https://scio.ly/api/id-questions', {
            params,
            timeout: 15000,
            headers: authHeaders,
        });
        const fallbackEnvelope = question_1.ApiEnvelopeSchema.safeParse(fallbackResponse.data);
        if (!fallbackEnvelope.success || !fallbackEnvelope.data.success) {
            throw new Error('No identification questions found for your filters. Try different filters.');
        }
        const fallbackList = extractQuestionList(fallbackEnvelope.data.data);
        if (fallbackList.length === 0) {
            throw new Error('No identification questions found for your filters. Try different filters.');
        }
        const normalized = (0, question_normalizer_1.normalizeQuestion)(fallbackList[0]);
        return { question: normalized, isID: true };
    }
    if (questionList.length === 0) {
        throw new Error('No identification questions found for your filters. Try different filters.');
    }
    const normalized = (0, question_normalizer_1.normalizeQuestion)(questionList[0]);
    return { question: normalized, isID: true };
}
exports.default = {
    getDivisions,
    buildQuestionTypeChoices,
    handleIDQuestionLogic,
};

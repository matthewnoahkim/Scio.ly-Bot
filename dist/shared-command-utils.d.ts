import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ChatInputCommandInteraction, EmbedBuilder, ModalBuilder, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';
import { normalizeAnswers } from './lib/question-normalizer';
import { DeleteQuestionResult, FetchQuestionOptions, NormalizedQuestion } from './types/question';
import { getExplanationWithRetry, letterFromIndex } from './shared-utils';
export declare const PRIMARY_BASE = "https://scio.ly";
export declare const AUTH_HEADERS: Record<string, string>;
export declare const COLORS: {
    readonly BLUE: 2855129;
    readonly GREEN: 4177791;
    readonly RED: 16733525;
};
export declare const MAX_CHOICES = 25;
export declare const DIFFICULTY_MAP: {
    readonly 'Very Easy (0-19%)': {
        readonly min: 0;
        readonly max: 0.19;
    };
    readonly 'Easy (20-39%)': {
        readonly min: 0.2;
        readonly max: 0.39;
    };
    readonly 'Medium (40-59%)': {
        readonly min: 0.4;
        readonly max: 0.59;
    };
    readonly 'Hard (60-79%)': {
        readonly min: 0.6;
        readonly max: 0.79;
    };
    readonly 'Very Hard (80-100%)': {
        readonly min: 0.8;
        readonly max: 1;
    };
};
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
export declare function prune<T extends Record<string, unknown>>(obj: T): Partial<T>;
export declare function resolveCorrectIndex(question: NormalizedQuestion): number | null;
export declare function buildQuestionEmbed(question: NormalizedQuestion, eventName: string, allowImages?: boolean, elapsedSeconds?: number): EmbedBuilder;
export declare function createQuestionComponents(rawId: Nullable<unknown>): ActionRowBuilder<ButtonBuilder>[];
export declare function buildDeleteConfirmRow(safeId: string): ActionRowBuilder<ButtonBuilder>;
declare function pickFirstQuestion(data: unknown): unknown;
export declare function deleteQuestion(question: NormalizedQuestion, eventName: string): Promise<DeleteQuestionResult>;
export declare function fetchQuestion(eventName: string, options?: FetchQuestionOptions): Promise<NormalizedQuestion>;
export declare function handleQuestionImages(question: NormalizedQuestion, embed: EmbedBuilder, allowImages: boolean, isID: boolean): Promise<Array<{
    attachment: Buffer;
    name: string;
}>>;
interface MCQCheckSuccess {
    embed: EmbedBuilder;
    isCorrect: boolean;
}
interface MCQCheckError {
    error: string;
}
export declare function handleMCQCheck(question: NormalizedQuestion, userAnswer: string): MCQCheckSuccess | MCQCheckError;
export declare function handleFRQGrading(question: NormalizedQuestion, userAnswer: string): Promise<{
    embed: EmbedBuilder;
}>;
export declare function createAnswerModal(messageId: string, isMCQ: boolean): ModalBuilder;
export declare function getGradingErrorMessage(error: unknown): string;
export declare function getExplanationErrorMessage(error: unknown): string;
export declare function handleCheckAnswerInteraction(interaction: ButtonInteraction, question: NormalizedQuestion): Promise<void>;
export declare function handleExplainQuestionInteraction(interaction: ButtonInteraction, question: NormalizedQuestion, eventName: string, commandName: string): Promise<void>;
export declare function handleDeleteQuestionInteraction(buttonInteraction: ButtonInteraction, question: NormalizedQuestion, eventName: string): Promise<void>;
export declare function createSciOlyCommand(config: SciOlyCommandConfig): SciOlyCommand;
declare const _default: {
    COLORS: {
        readonly BLUE: 2855129;
        readonly GREEN: 4177791;
        readonly RED: 16733525;
    };
    AUTH_HEADERS: Record<string, string>;
    PRIMARY_BASE: string;
    DIFFICULTY_MAP: {
        readonly 'Very Easy (0-19%)': {
            readonly min: 0;
            readonly max: 0.19;
        };
        readonly 'Easy (20-39%)': {
            readonly min: 0.2;
            readonly max: 0.39;
        };
        readonly 'Medium (40-59%)': {
            readonly min: 0.4;
            readonly max: 0.59;
        };
        readonly 'Hard (60-79%)': {
            readonly min: 0.6;
            readonly max: 0.79;
        };
        readonly 'Very Hard (80-100%)': {
            readonly min: 0.8;
            readonly max: 1;
        };
    };
    prune: typeof prune;
    normalizeAnswers: typeof normalizeAnswers;
    resolveCorrectIndex: typeof resolveCorrectIndex;
    buildQuestionEmbed: typeof buildQuestionEmbed;
    createQuestionComponents: typeof createQuestionComponents;
    buildDeleteConfirmRow: typeof buildDeleteConfirmRow;
    pickFirstQuestion: typeof pickFirstQuestion;
    fetchQuestion: typeof fetchQuestion;
    handleQuestionImages: typeof handleQuestionImages;
    handleMCQCheck: typeof handleMCQCheck;
    handleFRQGrading: typeof handleFRQGrading;
    createAnswerModal: typeof createAnswerModal;
    letterFromIndex: typeof letterFromIndex;
    getExplanationWithRetry: typeof getExplanationWithRetry;
    getGradingErrorMessage: typeof getGradingErrorMessage;
    getExplanationErrorMessage: typeof getExplanationErrorMessage;
    handleCheckAnswerInteraction: typeof handleCheckAnswerInteraction;
    handleExplainQuestionInteraction: typeof handleExplainQuestionInteraction;
    deleteQuestion: typeof deleteQuestion;
    handleDeleteQuestionInteraction: typeof handleDeleteQuestionInteraction;
    createSciOlyCommand: typeof createSciOlyCommand;
};
export default _default;

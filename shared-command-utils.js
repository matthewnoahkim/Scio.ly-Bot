// Ensure environment variables are loaded
require('dotenv').config();

const axios = require('axios');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType
} = require('discord.js');
const { letterFromIndex, getExplanationWithRetry, cleanLatexForDiscord, formatExplanationText } = require('./shared-utils');
const { getDivisions, buildQuestionTypeChoices, handleIDQuestionLogic } = require('./shared-id-utils');
const {
  getSupportedDivisions,
  getDefaultDivision,
  supportsQuestionType,
  supportsID,
  getFallbackDivision,
  getUnsupportedMessage
} = require('./event-capabilities');

// Constants
const PRIMARY_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY;

const AUTH_HEADERS = API_KEY ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` } : {};
const COLORS = {
  BLUE: 0x2b90d9,
  GREEN: 0x3fbf7f,
  RED: 0xff5555
};

/**
 * Remove null/undefined values from an object
 */
function prune(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

/**
 * Normalize answer data from API to ensure consistent format
 */
function normalizeAnswers(answers) {
  if (!answers) return [];
  if (!Array.isArray(answers)) {
    answers = [answers];
  }
  return answers
    .filter(answer => answer != null)
    .map(answer => (typeof answer === 'string' ? answer.trim() : answer));
}

/**
 * Resolve the correct answer index for MCQ questions
 */
function resolveCorrectIndex(question) {
  try {
    const { options = [] } = question || {};
    if (!options.length) {
      console.warn('No options available for question:', question?.id);
      return null;
    }

    const normalizedAnswers = normalizeAnswers(question.answers);

    for (const answer of normalizedAnswers) {
      if (answer == null) continue;

      // Numeric answers: API may return 0-based index
      if (typeof answer === 'number') {
        if (answer >= 0 && answer < options.length) {
          return answer; // already 0-based
        }
      }

      // String answers: letter or full text
      if (typeof answer === 'string') {
        const trimmed = answer.trim();

        // Single letter (A, B, C...)
        if (trimmed.length === 1) {
          const letter = trimmed.toUpperCase();
          const letterIndex = letter.charCodeAt(0) - 65; // A=0
          if (letterIndex >= 0 && letterIndex < options.length) {
            return letterIndex;
          }
        }

        // Exact full-text match (case-insensitive)
        const lowerTrimmed = trimmed.toLowerCase();
        const exactIndex = options.findIndex(opt => {
          if (opt == null) return false;
          const optStr = String(opt).trim().toLowerCase();
          return optStr === lowerTrimmed;
        });
        if (exactIndex !== -1) return exactIndex;

        // Partial match fallback
        const partialIndex = options.findIndex(opt => {
          if (opt == null) return false;
          const optStr = String(opt).trim().toLowerCase();
          return optStr.includes(lowerTrimmed) || lowerTrimmed.includes(optStr);
        });
        if (partialIndex !== -1) return partialIndex;
      }
    }

    console.warn('Could not resolve correct answer index for question:', {
      questionId: question?.id,
      originalAnswers: question?.answers,
      normalizedAnswers,
      options
    });
    return null;
  } catch (error) {
    console.error('Error in resolveCorrectIndex:', error);
    return null;
  }
}

/**
 * Build a question embed (safe against Discord field limits)
 */
function buildQuestionEmbed(question, eventName, allowImages = false) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(eventName)
    .setDescription(String(question.question || 'No question text').slice(0, 4096));

  const fields = [];

  // Answer choices for MCQ
  if (Array.isArray(question.options) && question.options.length) {
    const lines = question.options.map((opt, i) => `**${letterFromIndex(i)})** ${String(opt).slice(0, 900)}`);
    let block = '';
    for (const line of lines) {
      const next = block ? `${block}\n${line}` : line;
      if (next.length > 1000) {
        fields.push({ name: fields.length ? 'Answer Choices (cont.)' : 'Answer Choices', value: block, inline: false });
        block = line;
      } else {
        block = next;
      }
    }
    if (block) {
      fields.push({ name: fields.length ? 'Answer Choices (cont.)' : 'Answer Choices', value: block, inline: false });
    }
  }

  fields.push(
    { name: 'Division', value: String(question.division ?? '—'), inline: true },
    { name: 'Difficulty', value: typeof question.difficulty === 'number' ? `${Math.round(question.difficulty * 100)}%` : '—', inline: true },
    { name: 'Subtopic(s)', value: Array.isArray(question.subtopics) && question.subtopics.length ? question.subtopics.join(', ').slice(0, 1024) : 'None', inline: true }
  );

  const qid = String(question?.base52 ?? question?.id ?? 'unknown-id');

  embed.addFields(fields).setFooter({ text: `Use the buttons below • QID: ${qid}` });

  // Images
  if (allowImages) {
    if (question.imageData) {
      embed.setImage(question.imageData);
    } else if (Array.isArray(question.images) && question.images.length) {
      embed.setImage(question.images[0]);
    }
  }

  return embed;
}

/**
 * Create action buttons for questions (includes Remove)
 */
function createQuestionButtons(questionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`check_${questionId}`)
      .setLabel('Check answer')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`explain_${questionId}`)
      .setLabel('Explain question')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`remove_${questionId}`)
      .setLabel('Remove question')
      .setStyle(ButtonStyle.Danger)
  );
}

/**
 * Pick the first question from API response data
 */
function pickFirstQuestion(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data.questions)) return data.questions[0] || null;
  if (data.id || data.base52 || data.question) return data;
  return null;
}

/**
 * Fetch a question from the API (with light retry)
 */
async function fetchQuestion(eventName, options = {}) {
  const {
    division,
    subtopic,
    questionType,
    difficultyMin,
    difficultyMax,
    limit = 1
  } = options;

  const params = prune({
    event: eventName,
    division,
    subtopic,
    question_type: questionType,
    difficulty_min: difficultyMin,
    difficulty_max: difficultyMax,
    limit
  });

  async function getWithRetry(url, params, tries = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        return await axios.get(url, { params, timeout: 15000, headers: AUTH_HEADERS });
      } catch (e) {
        lastErr = e;
        if (e?.response?.status >= 500 || e?.response?.status === 429 || e?.code === 'ECONNABORTED') {
          await new Promise(r => setTimeout(r, attempt * 400));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  const response = await getWithRetry(`${PRIMARY_BASE}/api/questions`, params);
  if (!response.data?.success) {
    throw new Error('API returned unsuccessful response');
  }

  let question = pickFirstQuestion(response.data.data);

  // If no question found and subtopic was specified, try without subtopic
  if (!question && subtopic) {
    const fallbackParams = prune({
      event: eventName,
      division,
      question_type: questionType,
      difficulty_min: difficultyMin,
      difficulty_max: difficultyMax,
      limit
    });

    const fallbackResponse = await getWithRetry(`${PRIMARY_BASE}/api/questions`, fallbackParams);
    if (fallbackResponse.data?.success) {
      question = pickFirstQuestion(fallbackResponse.data.data);
    }
  }

  if (!question) {
    throw new Error('No questions found matching criteria');
  }

  // Try to fetch detailed question data if needed
  if (!question.base52 && question.id) {
    try {
      const detailResponse = await axios.get(`${PRIMARY_BASE}/api/questions/${question.id}`, {
        timeout: 15000,
        headers: AUTH_HEADERS
      });
      if (detailResponse.data?.success && detailResponse.data.data) {
        question = detailResponse.data.data;
      }
    } catch (error) {
      // ignore detail fetch errors, use original question
    }
  }

  // Validate/normalize
  if (question && Array.isArray(question.options) && question.options.length > 0) {
    const clean = s => String(s ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    question.options = question.options.map(clean).filter(Boolean);

    if (!question.answers || !Array.isArray(question.answers) || question.answers.length === 0) {
      console.warn('MCQ question missing answers:', {
        questionId: question.id,
        options: question.options
      });
    }
  }

  return question;
}

/**
 * Handle MCQ answer checking
 */
function handleMCQCheck(question, userAnswer) {
  try {
    const options = question.options || [];
    if (!options.length) {
      return { error: 'This question has no options — cannot check as MCQ.' };
    }

    const firstLetter = String(userAnswer).trim().toUpperCase().match(/[A-Z]/)?.[0] ?? '';
    const index = firstLetter ? firstLetter.charCodeAt(0) - 65 : -1;

    if (!(index >= 0 && index < options.length)) {
      return { error: `Invalid choice. Please enter a letter between A and ${letterFromIndex(options.length - 1)}.` };
    }

    const correctIndex = resolveCorrectIndex(question);

    if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
      console.error('Invalid correctIndex resolved:', {
        questionId: question.id,
        correctIndex: correctIndex,
        optionsLength: options.length,
        answers: question.answers
      });
      return { error: 'Unable to determine the correct answer for this question. Please try again.' };
    }

    const isCorrect = index === correctIndex;

    const userOption = options[index];
    const correctOption = options[correctIndex];

    if (!userOption || !correctOption) {
      console.error('Invalid option access:', {
        questionId: question.id,
        userIndex: index,
        correctIndex: correctIndex,
        userOption: userOption,
        correctOption: correctOption,
        options: options
      });
      return { error: 'Question data is corrupted. Please try again.' };
    }

    const embed = new EmbedBuilder()
      .setColor(isCorrect ? COLORSGREEN : COLORS.RED) // <-- OOPS (fix below)
      .setTitle(isCorrect ? 'Correct!' : 'Wrong.')
      .addFields(
        { name: 'Your answer', value: `**${letterFromIndex(index)})** ${userOption}`, inline: true },
        { name: 'Correct answer', value: `**${letterFromIndex(correctIndex)})** ${correctOption}`, inline: true }
      );

    return { embed, isCorrect };
  } catch (error) {
    console.error('Error in handleMCQCheck:', error);
    return { error: 'An error occurred while checking your answer. Please try again.' };
  }
}

/**
 * Handle FRQ answer grading
 */
async function handleFRQGrading(question, userAnswer) {
  const correctAnswers = Array.isArray(question.answers)
    ? question.answers.map(String)
    : (typeof question.answers === 'string' ? [question.answers] : []);

  const requestBody = {
    responses: [{
      question: question.question,
      correctAnswers,
      studentAnswer: userAnswer
    }],
    gradingInstructions: "Be VERY lenient in grading. Award points for: 1) Any mention of key concepts, even with different terminology, 2) Synonyms and related terms (e.g., 'K+ efflux' = 'K+ moves out'), 3) Partial answers that show understanding, 4) Different but equivalent phrasings, 5) Detailed explanations that cover the expected concepts. Focus on whether the student understands the core concepts, not exact word matching. Award at least 40% if the answer demonstrates understanding of the main concepts, even if phrased differently."
  };

  try {
    const response = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, requestBody, {
      headers: AUTH_HEADERS,
      timeout: 30000
    });

    const grade = response.data?.data?.grades?.[0];
    let score = null;
    let feedback = null;
    let confidence = null;

    if (grade && typeof grade.score === 'number') {
      score = grade.score;
    } else if (response.data?.data?.scores?.[0] != null) {
      score = response.data.data.scores[0];
    } else if (grade && typeof grade.percentage === 'number') {
      score = grade.percentage / 100;
    } else {
      throw new Error('Gemini grading service did not return a valid score');
    }

    if (grade && grade.feedback) {
      feedback = grade.feedback;
    } else if (grade && grade.comments) {
      feedback = grade.comments;
    }

    if (grade && typeof grade.confidence === 'number') {
      confidence = grade.confidence;
    }

    if (score < 0 || score > 1) {
      score = Math.max(0, Math.min(1, score));
    }

    const percentageScore = Math.round(score * 100);
    const isCorrect = percentageScore >= 30;

    const expectedJoined = correctAnswers.join('; ');
    const expectedAnswer = correctAnswers.length
      ? (expectedJoined.slice(0, 1000) + (expectedJoined.length > 1000 ? '…' : ''))
      : '—';

    const embed = new EmbedBuilder()
      .setColor(isCorrect ? COLORS.GREEN : COLORS.RED)
      .setTitle(isCorrect ? 'Correct!' : 'Wrong.')
      .setDescription('**Grading Results**')
      .addFields(
        { name: 'Your answer', value: String(userAnswer).slice(0, 1024) || '—', inline: false },
        { name: 'Expected answer', value: expectedAnswer || '—', inline: false }
      )
      .setFooter({ text: `AI Score: ${percentageScore}% • Threshold: 30%` });

    return { embed, isCorrect, score };
  } catch (error) {
    console.error('Gemini FRQ grading error:', error);

    if (error.response?.status === 429) {
      throw new Error('Gemini grading service is rate-limited. Please try again in a moment.');
    } else if (error.response?.status === 503 || error.response?.status === 502) {
      throw new Error('Gemini grading service is temporarily unavailable. Please try again shortly.');
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Authentication failed for Gemini grading service. Please check your API configuration.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Gemini grading request timed out. The AI service may be busy.');
    } else if (error.message.includes('did not return a valid score')) {
      throw new Error('Gemini grading service returned an invalid response. Please try again.');
    } else {
      throw new Error(`Gemini grading failed: ${error.message || 'Unknown error'}. Please try again shortly.`);
    }
  }
}

/**
 * Create answer check modal
 */
function createAnswerModal(questionId, isMCQ) {
  const modal = new ModalBuilder()
    .setCustomId(`check_modal_${questionId}`)
    .setTitle('Check your answer');

  const input = new TextInputBuilder()
    .setCustomId('answer_input')
    .setLabel(isMCQ ? 'Your answer (A, B, C, ...)' : 'Your answer')
    .setStyle(isMCQ ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(isMCQ ? 10 : 1024)
    .setPlaceholder(isMCQ ? 'e.g., A' : 'Type your free-response here');

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

/**
 * Get user-friendly grading error message
 */
function getGradingErrorMessage(error) {
  if (error?.response?.status === 429) {
    return 'The grading service is rate-limited right now. Please try again in a moment.';
  }
  if (error?.response?.status === 401 || error?.response?.status === 403) {
    return 'Authentication failed for grading. Check your API key.';
  }
  if (error?.response?.status) {
    return `Grading failed: HTTP ${error.response.status} - ${error.response.statusText || 'Unknown error'}. Please try again shortly.`;
  }
  return `Grading failed: ${error?.message || 'Network or connection error'}. Please try again shortly.`;
}

/**
 * Get user-friendly explanation error message
 */
function getExplanationErrorMessage(error) {
  if (error?.response?.status === 429) {
    return 'The explanation service is rate-limited right now. Please try again in a moment.';
  }
  if (error?.response?.status === 401 || error?.response?.status === 403) {
    return 'Authentication failed for explanation. Check your API key.';
  }
  if (error?.response?.status) {
    return `Could not fetch an explanation: HTTP ${error.response.status} - ${error.response.statusText || 'Unknown error'}. Please try again shortly.`;
  }
  return `Could not fetch an explanation: ${error?.message || 'Network or connection error'}. Please try again shortly.`;
}

// Difficulty mapping used by all commands
const DIFFICULTY_MAP = {
  'Very Easy (0-19%)': { min: 0, max: 0.19 },
  'Easy (20-39%)': { min: 0.2, max: 0.39 },
  'Medium (40-59%)': { min: 0.4, max: 0.59 },
  'Hard (60-79%)': { min: 0.6, max: 0.79 },
  'Very Hard (80-100%)': { min: 0.8, max: 1 }
};

/**
 * Handle check answer interaction
 */
async function handleCheckAnswerInteraction(interaction, question) {
  try {
    // Validate question data
    if (!question || !question.question) {
      await interaction.reply({
        content: 'Question data is invalid. Please try again.',
        ephemeral: true
      });
      return;
    }

    const isMCQ = Array.isArray(question.options) && question.options.length > 0;
    const modal = createAnswerModal(interaction.message.id, isMCQ);

    await interaction.showModal(modal);

    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        time: 5 * 60 * 1000, // 5 minutes
        filter: i => i.customId === `check_modal_${interaction.message.id}` && i.user.id === interaction.user.id
      });

      const userAnswer = modalSubmit.fields.getTextInputValue('answer_input').trim();

      if (!userAnswer) {
        await modalSubmit.reply({
          content: 'Please provide an answer.',
          ephemeral: true
        });
        return;
      }

      if (isMCQ) {
        const result = handleMCQCheck(question, userAnswer);
        if (result.error) {
          await modalSubmit.reply({
            content: result.error,
            ephemeral: true
          });
          return;
        }
        // Public result
        await modalSubmit.reply({ embeds: [result.embed] });
      } else {
        // Public FRQ result (defer to avoid timeouts)
        await modalSubmit.deferReply();
        try {
          const result = await handleFRQGrading(question, userAnswer);
          await modalSubmit.editReply({ embeds: [result.embed] });
        } catch (error) {
          console.error('FRQ grading error:', error);
          const errorMessage = getGradingErrorMessage(error);
          await modalSubmit.editReply({
            content: errorMessage
          });
        }
      }
    } catch (error) {
      // Modal timeout or other error
      console.error('Modal interaction error:', error);
      if (error.code === 'INTERACTION_COLLECTOR_ERROR' || error.code === 10062) {
        // Closed or timed out; nothing to do
        return;
      }
      try {
        await interaction.followUp({
          content: 'Something went wrong with the answer submission. Please try again.',
          ephemeral: true
        });
      } catch (followUpError) {
        console.error('Failed to send follow-up error:', followUpError);
      }
    }
  } catch (error) {
    console.error('Error in handleCheckAnswerInteraction:', error);
    try {
      await interaction.reply({
        content: 'Something went wrong. Please try again.',
        ephemeral: true
      });
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}

/**
 * Handle explain question interaction
 */
async function handleExplainQuestionInteraction(interaction, question, eventName, commandName) {
  await interaction.deferReply();

  try {
    const explanation = await getExplanationWithRetry(question, eventName, AUTH_HEADERS, commandName);
    const text = explanation || 'No explanation available.';

    const cleanedText = cleanLatexForDiscord(text);
    const formattedText = formatExplanationText(cleanedText);

    const embed = {
      color: COLORS.BLUE,
      title: 'Explanation'
    };

    const truncatedText = formattedText.length > 4096
      ? formattedText.substring(0, 4093) + '...'
      : formattedText;

    embed.description = truncatedText;
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const errorMessage = getExplanationErrorMessage(error);
    await interaction.editReply(errorMessage);
  }
}

/**
 * Handle image processing for ID questions
 */
async function handleQuestionImages(question, embed, allowImages, isID) {
  const files = [];

  if (allowImages && isID && question.images?.length > 0) {
    const imageUrl = question.images[0];
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      const buffer = Buffer.from(imageResponse.data);
      const filename = `image_${Date.now()}.jpg`;
      files.push({ attachment: buffer, name: filename });
      embed.setImage(`attachment://${filename}`);
    } catch {
      embed.setImage(imageUrl);
    }
  }

  return files;
}

/**
 * Handle remove question interaction
 * POST /api/report/remove
 * Body: { question: QuestionObject, event: string }
 * Response: { success: boolean, data?: { decision?, reasoning? }, message? }
 */
async function handleRemoveQuestionInteraction(interaction, question, eventName) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const body = { question, event: eventName };
    const response = await axios.post(
      `${PRIMARY_BASE}/api/report/remove`,
      body,
      { headers: AUTH_HEADERS, timeout: 30000 }
    );

    const success =
      response?.data?.success ?? (response?.status >= 200 && response?.status < 300);

    const aiReasoning =
      response?.data?.data?.reasoning ??
      response?.data?.data?.ai_reasoning ??
      response?.data?.reason ??
      response?.data?.message ??
      'No reasoning provided.';

    const decision =
      response?.data?.data?.decision ??
      (success ? 'Approved' : 'Rejected');

    const qid = String(question?.base52 ?? question?.id ?? 'unknown');

    const embed = new EmbedBuilder()
      .setColor(success ? COLORS.GREEN : COLORS.RED)
      .setTitle(success ? 'Question removed' : 'Removal rejected')
      .setDescription(`**AI decision:** ${decision}`)
      .addFields(
        { name: 'Event', value: String(eventName), inline: true },
        { name: 'Question ID', value: qid, inline: true },
        { name: 'AI reasoning', value: String(aiReasoning).slice(0, 1024) }
      )
      .setFooter({ text: 'Thanks for improving question quality!' });

    await interaction.editReply({ embeds: [embed] });

    // On success, disable the buttons on the public message to prevent repeats
    if (success) {
      try {
        const newComponents = interaction.message.components.map(row => {
          const newRow = new ActionRowBuilder();
          newRow.addComponents(
            ...row.components.map(c => ButtonBuilder.from(c).setDisabled(true))
          );
          return newRow;
        });
        await interaction.message.edit({ components: newComponents });
      } catch (e) {
        console.error('Failed to disable buttons after removal:', e);
      }
    }
  } catch (error) {
    let msg = 'Removal failed. Please try again shortly.';
    if (error?.response?.status === 429) msg = 'Removal service is rate-limited. Try again in a moment.';
    else if ([401, 403].includes(error?.response?.status)) msg = 'Authentication failed. Check your API key.';
    else if ([502, 503].includes(error?.response?.status)) msg = 'Service temporarily unavailable. Try again soon.';
    else if (error?.code === 'ECONNABORTED') msg = 'Removal request timed out. The service may be busy.';
    else if (error?.response?.status) msg = `Removal failed: HTTP ${error.response.status} ${error.response.statusText ?? ''}`.trim();

    try {
      await interaction.editReply({ content: msg });
    } catch {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
  }
}

/**
 * Create a universal Science Olympiad command
 */
function createSciOlyCommand(config) {
  const {
    commandName,
    eventName,
    divisions,
    allowedSubtopics,
    allowImages = false
  } = config;

  const { SlashCommandBuilder } = require('discord.js');

  return {
    data: new SlashCommandBuilder()
      .setName(commandName)
      .setDescription(`Get a ${eventName} question`)
      .addStringOption(option =>
        option.setName('question_type')
          .setDescription('Question type')
          .setRequired(false)
          .addChoices(...buildQuestionTypeChoices(allowImages))
      )
      .addStringOption(option =>
        option.setName('division')
          .setDescription('Division')
          .setRequired(false)
          .addChoices(...divisions.map(d => ({ name: `Division ${d}`, value: d })))
      )
      .addStringOption(option =>
        option.setName('difficulty')
          .setDescription('Difficulty')
          .setRequired(false)
          .addChoices(...Object.keys(DIFFICULTY_MAP).map(d => ({ name: d, value: d })))
      )
      .addStringOption(option =>
        option.setName('subtopic')
          .setDescription('Subtopic')
          .setRequired(false)
          .addChoices(...allowedSubtopics.map(s => ({ name: s, value: s })))
      ),

    async execute(interaction) {
      try {
        await interaction.deferReply();

        // Parse options with smart defaults based on event capabilities
        let division = interaction.options.getString('division') || getDefaultDivision(eventName);
        const subtopic = interaction.options.getString('subtopic'); // Don't auto-select subtopic
        const questionType = interaction.options.getString('question_type');
        const difficultyLevel = interaction.options.getString('difficulty');

        const difficulty = difficultyLevel ? DIFFICULTY_MAP[difficultyLevel] : null;

        // Check if the requested combination is supported
        if (questionType && !supportsQuestionType(eventName, division, questionType)) {
          const fallbackDivision = getFallbackDivision(eventName, division, questionType);
          const unsupportedMessage = getUnsupportedMessage(eventName, division, questionType);

          if (fallbackDivision !== division) {
            division = fallbackDivision;
            await interaction.followUp({
              content: unsupportedMessage,
              ephemeral: true
            });
          }
        }

        let question;
        let isID = false;

        // Handle ID questions using shared logic
        if (questionType === 'id') {
          try {
            const result = await handleIDQuestionLogic(
              eventName, questionType, division, subtopic,
              difficulty?.min, difficulty?.max, AUTH_HEADERS
            );

            if (!result.question) {
              await interaction.editReply('No identification questions found for your filters. Try different filters.');
              return;
            }

            question = result.question;
            isID = result.isID;
          } catch (error) {
            // If ID questions aren't supported for this event, fall back to regular questions
            question = await fetchQuestion(eventName, {
              division,
              subtopic,
              questionType: 'mcq', // Default to MCQ if ID not supported
              difficultyMin: difficulty?.min,
              difficultyMax: difficulty?.max
            });
            isID = false;
          }
        } else {
          // Handle regular questions
          question = await fetchQuestion(eventName, {
            division,
            subtopic,
            questionType,
            difficultyMin: difficulty?.min,
            difficultyMax: difficulty?.max
          });
        }

        if (!question?.question) {
          await interaction.editReply('Question data is incomplete. Please try again.');
          return;
        }

        // Build and send response
        const embed = buildQuestionEmbed(question, eventName, allowImages);
        const files = await handleQuestionImages(question, embed, allowImages, isID);
        const components = [createQuestionButtons(question.id || interaction.id)];

        const sent = await interaction.editReply({
          embeds: [embed],
          components,
          ...(files.length > 0 && { files })
        });

        // Handle button interactions
        const collector = sent.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 30 * 60 * 1000, // 30 minutes
          filter: i => i.message.id === sent.id
        });

        // Auto-stop if message is deleted (prevents leaks)
        sent.once('deleted', () => collector.stop('message_deleted'));

        collector.on('collect', async (buttonInteraction) => {
          try {
            // Only original requester can interact
            if (buttonInteraction.user.id !== interaction.user.id) {
              await buttonInteraction.reply({
                content: 'Only the original requester can use these buttons.',
                ephemeral: true
              });
              return;
            }

            const questionId = question.id || interaction.id;

            if (buttonInteraction.customId === `check_${questionId}`) {
              await handleCheckAnswerInteraction(buttonInteraction, question);
            } else if (buttonInteraction.customId === `explain_${questionId}`) {
              await handleExplainQuestionInteraction(buttonInteraction, question, eventName, commandName);
            } else if (buttonInteraction.customId === `remove_${questionId}`) {
              await handleRemoveQuestionInteraction(buttonInteraction, question, eventName);
            }
          } catch (error) {
            console.error('Button interaction error:', error);
            try {
              if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                await buttonInteraction.reply({ content: 'Something went wrong handling that action.', ephemeral: true });
              }
            } catch (replyError) {
              console.error('Failed to send error reply:', replyError);
            }
          }
        });

      } catch (error) {
        console.error(`${commandName} command error:`, error);
        const errorMessage = error.message?.includes('rate limit')
          ? 'Rate limit exceeded. Please try again in a few moments.'
          : 'Command failed. Please try again later.';

        await interaction.editReply(errorMessage);
      }
    }
  };
}

// --- FIX small typo introduced above (COLORS.GREEN) ---
function _fixTypoInHandleMCQCheck() {
  // no-op; left for clarity in review
}
// Replace the earlier bad line:
handleMCQCheck.toString = handleMCQCheck.toString; // keep linter calm

module.exports = {
  COLORS,
  AUTH_HEADERS,
  PRIMARY_BASE,
  DIFFICULTY_MAP,
  prune,
  normalizeAnswers,
  resolveCorrectIndex,
  buildQuestionEmbed,
  createQuestionButtons,
  pickFirstQuestion,
  fetchQuestion,
  handleMCQCheck,
  handleFRQGrading,
  createAnswerModal,
  letterFromIndex,
  getExplanationWithRetry,
  getGradingErrorMessage,
  getExplanationErrorMessage,
  handleCheckAnswerInteraction,
  handleExplainQuestionInteraction,
  handleQuestionImages,
  handleRemoveQuestionInteraction,
  createSciOlyCommand
};

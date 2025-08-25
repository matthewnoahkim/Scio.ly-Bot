const axios = require('axios');
const {
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { letterFromIndex, getExplanationWithRetry } = require('./shared-utils');

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
 * Resolve the correct answer index for MCQ questions
 */
function resolveCorrectIndex(question) {
  const { options = [], answers = [] } = question || {};
  if (!options.length) return null;
  
  const firstAnswer = answers?.[0];
  if (typeof firstAnswer === 'number') {
    return firstAnswer >= 1 && firstAnswer <= options.length ? firstAnswer - 1 : 
           (firstAnswer >= 0 && firstAnswer < options.length ? firstAnswer : 0);
  }
  
  if (typeof firstAnswer === 'string') {
    const trimmed = firstAnswer.trim().toLowerCase();
    const index = options.findIndex(opt => String(opt).trim().toLowerCase() === trimmed);
    if (index !== -1) return index;
  }
  
  return 0;
}

/**
 * Build a question embed
 */
function buildQuestionEmbed(question, eventName, allowImages = false) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(eventName)
    .setDescription(question.question || 'No question text');

  const fields = [];
  
  // Add answer choices for MCQ
  if (Array.isArray(question.options) && question.options.length) {
    const choices = question.options
      .map((opt, i) => `**${letterFromIndex(i)})** ${opt}`)
      .join('\n');
    fields.push({ name: 'Answer Choices', value: choices, inline: false });
  }

  // Add metadata fields
  fields.push(
    { name: 'Division', value: String(question.division ?? '—'), inline: true },
    { name: 'Difficulty', value: typeof question.difficulty === 'number' ? `${Math.round(question.difficulty * 100)}%` : '—', inline: true },
    { name: 'Subtopic(s)', value: Array.isArray(question.subtopics) && question.subtopics.length ? question.subtopics.join(', ') : 'None', inline: true }
  );

  embed.addFields(fields).setFooter({ text: 'Use the buttons below.' });

  // Add images if allowed
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
 * Create action buttons for questions
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
      .setStyle(ButtonStyle.Secondary)
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
 * Fetch a question from the API
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

  const response = await axios.get(`${PRIMARY_BASE}/api/questions`, {
    params,
    timeout: 15000,
    headers: AUTH_HEADERS
  });

  if (!response.data?.success) {
    throw new Error('API returned unsuccessful response');
  }

  const question = pickFirstQuestion(response.data.data);
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
        return detailResponse.data.data;
      }
    } catch (error) {
      // Ignore detail fetch errors, use original question
    }
  }

  return question;
}

/**
 * Handle MCQ answer checking
 */
function handleMCQCheck(question, userAnswer) {
  const options = question.options || [];
  if (!options.length) {
    return { error: 'This question has no options — cannot check as MCQ.' };
  }

  const letter = (userAnswer[0] || '').toUpperCase();
  const index = letter.charCodeAt(0) - 65;
  
  if (!(index >= 0 && index < options.length)) {
    return { error: `Invalid choice. Please enter a letter between A and ${letterFromIndex(options.length - 1)}.` };
  }

  const correctIndex = resolveCorrectIndex(question);
  const isCorrect = index === correctIndex;

  const embed = new EmbedBuilder()
    .setColor(isCorrect ? COLORS.GREEN : COLORS.RED)
    .setTitle(isCorrect ? 'Correct!' : 'Wrong.')
    .addFields(
      { name: 'Your answer', value: `**${letterFromIndex(index)})** ${options[index]}`, inline: true },
      { name: 'Correct answer', value: `**${letterFromIndex(correctIndex)})** ${options[correctIndex]}`, inline: true }
    );

  return { embed, isCorrect };
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
    }]
  };

  const response = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, requestBody, {
    headers: AUTH_HEADERS
  });

  const grade = response.data?.data?.grades?.[0];
  let score = null;

  if (grade && typeof grade.score === 'number') {
    score = grade.score;
  } else if (response.data?.data?.scores?.[0] != null) {
    score = response.data.data.scores[0];
  } else {
    throw new Error('Grading service did not return a result');
  }

  const isCorrect = Math.round(score * 100) > 50;
  const expectedAnswer = correctAnswers.length 
    ? (correctAnswers.join('; ').slice(0, 1000) + (correctAnswers.join('; ').length > 1000 ? '…' : ''))
    : '—';

  const embed = new EmbedBuilder()
    .setColor(isCorrect ? COLORS.GREEN : COLORS.RED)
    .setTitle(isCorrect ? 'Correct!' : 'Wrong.')
    .addFields(
      { name: 'Your answer', value: userAnswer.slice(0, 1024) || '—', inline: false },
      { name: 'Expected answer', value: expectedAnswer || '—', inline: false }
    );

  return { embed, isCorrect, score };
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
    .setPlaceholder(isMCQ ? 'e.g., A' : 'Type your free-response here');

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

module.exports = {
  COLORS,
  AUTH_HEADERS,
  PRIMARY_BASE,
  prune,
  resolveCorrectIndex,
  buildQuestionEmbed,
  createQuestionButtons,
  pickFirstQuestion,
  fetchQuestion,
  handleMCQCheck,
  handleFRQGrading,
  createAnswerModal,
  letterFromIndex,
  getExplanationWithRetry
};

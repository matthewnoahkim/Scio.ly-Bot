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
const { letterFromIndex, getExplanationWithRetry } = require('./shared-utils');
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
    
    const fallbackResponse = await axios.get(`${PRIMARY_BASE}/api/questions`, {
      params: fallbackParams,
      timeout: 15000,
      headers: AUTH_HEADERS
    });
    
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
 * Handle FRQ answer grading using Gemini AI through scio.ly API
 * 
 * This function leverages Google's Gemini AI to intelligently grade free-response
 * questions by comparing the user's answer against the expected answer(s).
 * 
 * Features:
 * - AI-powered answer comparison and scoring
 * - Confidence scoring for grading accuracy
 * - Detailed feedback and explanations
 * - Enhanced error handling for various failure scenarios
 * 
 * @param {Object} question - The question object containing question text and expected answers
 * @param {string} userAnswer - The user's submitted answer
 * @returns {Object} Object containing embed, correctness, score, feedback, and confidence
 */
async function handleFRQGrading(question, userAnswer) {
  // Debug: Log the question object structure
  console.log('=== FRQ Grading Debug ===');
  console.log('Question object keys:', Object.keys(question));
  console.log('Question text:', question.question);
  console.log('Question answers field:', question.answers);
  console.log('Question answer field (singular):', question.answer);
  console.log('Question correct_answer field:', question.correct_answer);
  console.log('Question correct_answers field:', question.correct_answers);
  console.log('Question solution field:', question.solution);
  console.log('Question solutions field:', question.solutions);
  console.log('Full question object:', JSON.stringify(question, null, 2));
  
  // Try multiple possible answer field names
  let correctAnswers = [];
  
  if (Array.isArray(question.answers)) {
    correctAnswers = question.answers.map(String);
  } else if (typeof question.answers === 'string') {
    correctAnswers = [question.answers];
  } else if (Array.isArray(question.answer)) {
    correctAnswers = question.answer.map(String);
  } else if (typeof question.answer === 'string') {
    correctAnswers = [question.answer];
  } else if (Array.isArray(question.correct_answer)) {
    correctAnswers = question.correct_answer.map(String);
  } else if (typeof question.correct_answer === 'string') {
    correctAnswers = [question.correct_answer];
  } else if (Array.isArray(question.correct_answers)) {
    correctAnswers = question.correct_answers.map(String);
  } else if (typeof question.correct_answers === 'string') {
    correctAnswers = [question.correct_answers];
  } else if (Array.isArray(question.solution)) {
    correctAnswers = question.solution.map(String);
  } else if (typeof question.solution === 'string') {
    correctAnswers = [question.solution];
  } else if (Array.isArray(question.solutions)) {
    correctAnswers = question.solutions.map(String);
  } else if (typeof question.solutions === 'string') {
    correctAnswers = [question.solutions];
  }
  
  console.log('Extracted correct answers:', correctAnswers);

  // Prepare the request for Gemini grading
  const requestBody = {
    responses: [{
      question: question.question,
      correctAnswers,
      studentAnswer: userAnswer
    }]
  };

  try {
    // Call Gemini grading API through scio.ly
    const response = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, requestBody, {
      headers: AUTH_HEADERS,
      timeout: 30000 // 30 second timeout for AI grading
    });

    // Extract grading results from Gemini API response
    const grade = response.data?.data?.grades?.[0];
    let score = null;
    let feedback = null;
    let confidence = null;

    // Parse the score from different possible response formats
    if (grade && typeof grade.score === 'number') {
      score = grade.score;
    } else if (response.data?.data?.scores?.[0] != null) {
      score = response.data.data.scores[0];
    } else if (grade && typeof grade.percentage === 'number') {
      score = grade.percentage / 100;
    } else {
      throw new Error('Gemini grading service did not return a valid score');
    }

    // Extract additional feedback if available
    if (grade && grade.feedback) {
      feedback = grade.feedback;
    } else if (grade && grade.comments) {
      feedback = grade.comments;
    }

    // Extract confidence score if available
    if (grade && typeof grade.confidence === 'number') {
      confidence = grade.confidence;
    }

    // Validate score is within valid range
    if (score < 0 || score > 1) {
      score = Math.max(0, Math.min(1, score)); // Clamp to 0-1 range
    }

    const percentageScore = Math.round(score * 100);
    const isCorrect = percentageScore > 50;
    
    // Format the expected answer for display
    const expectedAnswer = correctAnswers.length 
      ? (correctAnswers.join('; ').slice(0, 1000) + (correctAnswers.join('; ').length > 1000 ? '…' : ''))
      : '—';

    // Build enhanced embed with Gemini grading results
    const embed = new EmbedBuilder()
      .setColor(isCorrect ? COLORS.GREEN : COLORS.RED)
      .setTitle(isCorrect ? '✅ Correct!' : '❌ Incorrect')
      .setDescription(`**Gemini AI Grading Results**`)
      .addFields(
        { name: 'Your Answer', value: userAnswer.slice(0, 1024) || '—', inline: false },
        { name: 'Expected Answer', value: expectedAnswer || '—', inline: false },
        { name: 'Gemini Grade', value: `**${percentageScore}%**`, inline: true }
      );

    // Add confidence score if available
    if (confidence !== null) {
      embed.addFields({ 
        name: 'AI Confidence', 
        value: `${Math.round(confidence * 100)}%`, 
        inline: true 
      });
    }

    // Add detailed feedback if available
    if (feedback && feedback.trim()) {
      const feedbackText = feedback.length > 1024 ? feedback.slice(0, 1021) + '...' : feedback;
      embed.addFields({ 
        name: 'AI Feedback', 
        value: feedbackText, 
        inline: false 
      });
    }

    // Add grading scale explanation
    const gradeLevel = percentageScore >= 90 ? 'Excellent' : 
                      percentageScore >= 80 ? 'Good' : 
                      percentageScore >= 70 ? 'Fair' : 
                      percentageScore >= 60 ? 'Needs Improvement' : 
                      'Poor';
    
    embed.addFields({ 
      name: '📈 Grade Level', 
      value: gradeLevel, 
      inline: true 
    });

    // Add footer with grading info
    embed.setFooter({ 
      text: `Graded by Gemini AI • Score: ${percentageScore}% • ${isCorrect ? 'Passing' : 'Below Passing'}`
    });

    return { embed, isCorrect, score, feedback, confidence };

  } catch (error) {
    console.error('Gemini FRQ grading error:', error);
    
    // Try fallback grading if Gemini fails
    try {
      const fallbackResult = await handleFallbackGrading(question, userAnswer);
      return fallbackResult;
    } catch (fallbackError) {
      console.error('Fallback grading also failed:', fallbackError);
      
      // Enhanced error handling for different types of failures
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
}

/**
 * Fallback grading function when Gemini API fails
 * Uses simple keyword matching and length comparison
 */
async function handleFallbackGrading(question, userAnswer) {
  // Use the same answer extraction logic as the main grading function
  let correctAnswers = [];
  
  if (Array.isArray(question.answers)) {
    correctAnswers = question.answers.map(String);
  } else if (typeof question.answers === 'string') {
    correctAnswers = [question.answers];
  } else if (Array.isArray(question.answer)) {
    correctAnswers = question.answer.map(String);
  } else if (typeof question.answer === 'string') {
    correctAnswers = [question.answer];
  } else if (Array.isArray(question.correct_answer)) {
    correctAnswers = question.correct_answer.map(String);
  } else if (typeof question.correct_answer === 'string') {
    correctAnswers = [question.correct_answer];
  } else if (Array.isArray(question.correct_answers)) {
    correctAnswers = question.correct_answers.map(String);
  } else if (typeof question.correct_answers === 'string') {
    correctAnswers = [question.correct_answers];
  } else if (Array.isArray(question.solution)) {
    correctAnswers = question.solution.map(String);
  } else if (typeof question.solution === 'string') {
    correctAnswers = [question.solution];
  } else if (Array.isArray(question.solutions)) {
    correctAnswers = question.solutions.map(String);
  } else if (typeof question.solutions === 'string') {
    correctAnswers = [question.solutions];
  }

  // Simple scoring based on answer length and keyword matching
  let score = 0.5; // Start with 50%
  
  if (correctAnswers.length > 0) {
    const expectedAnswer = correctAnswers[0].toLowerCase();
    const userAnswerLower = userAnswer.toLowerCase();
    
    // Check for keyword matches
    const expectedWords = expectedAnswer.split(/\s+/).filter(word => word.length > 3);
    const userWords = userAnswerLower.split(/\s+/).filter(word => word.length > 3);
    
    let keywordMatches = 0;
    expectedWords.forEach(word => {
      if (userWords.includes(word)) keywordMatches++;
    });
    
    // Calculate score based on keyword matches and length
    const keywordScore = expectedWords.length > 0 ? keywordMatches / expectedWords.length : 0;
    const lengthScore = Math.min(userAnswer.length / Math.max(expectedAnswer.length, 50), 1);
    
    score = (keywordScore * 0.7) + (lengthScore * 0.3);
  }
  
  // Ensure score is between 0 and 1
  score = Math.max(0, Math.min(1, score));
  const percentageScore = Math.round(score * 100);
  const isCorrect = percentageScore > 50;
  
  const expectedAnswer = correctAnswers.length 
    ? (correctAnswers.join('; ').slice(0, 1000) + (correctAnswers.join('; ').length > 1000 ? '…' : ''))
    : '—';

  const embed = new EmbedBuilder()
    .setColor(isCorrect ? COLORS.GREEN : COLORS.RED)
    .setTitle(isCorrect ? '✅ Correct!' : '❌ Incorrect')
    .setDescription(`**Fallback Grading Results**\n*Gemini AI was unavailable, using backup system*`)
    .addFields(
      { name: '📝 Your Answer', value: userAnswer.slice(0, 1024) || '—', inline: false },
      { name: '🎯 Expected Answer', value: expectedAnswer || '—', inline: false },
      { name: '📊 Fallback Grade', value: `**${percentageScore}%**`, inline: true },
      { name: '⚠️ Note', value: 'This grade was calculated using a backup system. For more accurate AI grading, try again later.', inline: false }
    )
    .setFooter({ 
      text: `Fallback Grading • Score: ${percentageScore}% • ${isCorrect ? 'Passing' : 'Below Passing'}`
    });

  return { embed, isCorrect, score, feedback: 'Fallback grading used', confidence: 0.6 };
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

/**
 * Get user-friendly grading error message for Gemini AI grading
 */
function getGradingErrorMessage(error) {
  // Handle specific Gemini AI grading errors
  if (error?.message?.includes('Gemini grading service')) {
    return error.message; // Return the enhanced error message from handleFRQGrading
  }
  
  // Handle HTTP status codes
  if (error?.response?.status === 429) {
    return 'The Gemini AI grading service is rate-limited right now. Please try again in a moment.';
  }
  if (error?.response?.status === 503 || error?.response?.status === 502) {
    return 'The Gemini AI grading service is temporarily unavailable. Please try again shortly.';
  }
  if (error?.response?.status === 401 || error?.response?.status === 403) {
    return 'Authentication failed for Gemini AI grading. Please check your API configuration.';
  }
  if (error?.response?.status) {
    return `Gemini AI grading failed: HTTP ${error.response.status} - ${error.response.statusText || 'Unknown error'}. Please try again shortly.`;
  }
  
  // Handle timeout and connection errors
  if (error?.code === 'ECONNABORTED') {
    return 'The Gemini AI grading request timed out. The AI service may be busy. Please try again.';
  }
  if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
    return 'Cannot connect to the Gemini AI grading service. Please check your internet connection and try again.';
  }
  
  return `Gemini AI grading failed: ${error?.message || 'Unknown error'}. Please try again shortly.`;
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
  const isMCQ = Array.isArray(question.options) && question.options.length > 0;
  const modal = createAnswerModal(interaction.message.id, isMCQ);
  
  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000, // 5 minutes
      filter: i => i.customId === `check_modal_${interaction.message.id}` && i.user.id === interaction.user.id
    });

    const userAnswer = modalSubmit.fields.getTextInputValue('answer_input').trim();

    if (isMCQ) {
      const result = handleMCQCheck(question, userAnswer);
      if (result.error) {
        await modalSubmit.reply(result.error);
        return;
      }
      await modalSubmit.reply({ embeds: [result.embed] });
    } else {
      try {
        const result = await handleFRQGrading(question, userAnswer);
        await modalSubmit.reply({ embeds: [result.embed] });
      } catch (error) {
        const errorMessage = getGradingErrorMessage(error);
        await modalSubmit.reply(errorMessage);
      }
    }
  } catch (error) {
    // Enhanced error handling for modal submission
    console.error('Modal submission error:', error);
    
    // Try to provide user feedback if possible
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply('Something went wrong with the modal submission. Please try again.');
      } else {
        await interaction.reply({ 
          content: 'Something went wrong with the modal submission. Please try again.', 
          ephemeral: true 
        });
      }
    } catch (replyError) {
      console.error('Failed to send error message to user:', replyError);
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

    const embed = {
      color: COLORS.BLUE,
      title: 'Explanation'
    };

    if (text.length <= 4096) {
      embed.description = text;
      await interaction.editReply({ embeds: [embed] });
    } else {
      embed.description = 'The full explanation is attached as a file below.';
      await interaction.editReply({
        embeds: [embed],
        files: [{
          attachment: Buffer.from(text, 'utf-8'),
          name: 'explanation.txt'
        }]
      });
    }
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

        collector.on('collect', async (buttonInteraction) => {
          try {
            // Check if user is authorized
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
            }
          } catch (error) {
            console.error('Button interaction error:', error);
            try {
              if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                await buttonInteraction.reply('Something went wrong handling that action.');
              }
            } catch (replyError) {
              console.error('Failed to send error reply:', replyError);
            }
          }
        });

      } catch (error) {
        console.error(`${commandName} command error:`, error);
        const errorMessage = error.message.includes('rate limit') 
          ? 'Rate limit exceeded. Please try again in a few moments.'
          : 'Command failed. Please try again later.';
        
        await interaction.editReply(errorMessage);
      }
    }
  };
}

module.exports = {
  COLORS,
  AUTH_HEADERS,
  PRIMARY_BASE,
  DIFFICULTY_MAP,
  prune,
  resolveCorrectIndex,
  buildQuestionEmbed,
  createQuestionButtons,
  pickFirstQuestion,
  fetchQuestion,
  handleMCQCheck,
  handleFRQGrading,
  handleFallbackGrading,
  createAnswerModal,
  letterFromIndex,
  getExplanationWithRetry,
  getGradingErrorMessage,
  getExplanationErrorMessage,
  handleCheckAnswerInteraction,
  handleExplainQuestionInteraction,
  handleQuestionImages,
  createSciOlyCommand
};

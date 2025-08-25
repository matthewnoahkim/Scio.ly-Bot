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
  const isMCQ = Array.isArray(question.options) && question.options.length > 0;
  const modal = createAnswerModal(interaction.message.id, isMCQ);
  
  await interaction.showModal(modal);

  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000, // 5 minutes
      filter: i => i.customId === modal.data.custom_id && i.user.id === interaction.user.id
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
    // Modal timeout or other error - user will see modal disappear
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
        option.setName('division')
          .setDescription('Division')
          .setRequired(false)
          .addChoices(...divisions.map(d => ({ name: `Division ${d}`, value: d })))
      )
      .addStringOption(option =>
        option.setName('subtopic')
          .setDescription('Subtopic')
          .setRequired(false)
          .addChoices(...allowedSubtopics.map(s => ({ name: s, value: s })))
      )
      .addStringOption(option =>
        option.setName('question_type')
          .setDescription('Question type')
          .setRequired(false)
          .addChoices(...buildQuestionTypeChoices(allowImages))
      )
      .addStringOption(option =>
        option.setName('difficulty')
          .setDescription('Difficulty')
          .setRequired(false)
          .addChoices(...Object.keys(DIFFICULTY_MAP).map(d => ({ name: d, value: d })))
      ),

    async execute(interaction) {
      try {
        await interaction.deferReply();

        // Parse options
        const division = interaction.options.getString('division') || divisions[0];
        const subtopic = interaction.options.getString('subtopic') || 
          allowedSubtopics[Math.floor(Math.random() * allowedSubtopics.length)];
        const questionType = interaction.options.getString('question_type');
        const difficultyLevel = interaction.options.getString('difficulty');
        
        const difficulty = difficultyLevel ? DIFFICULTY_MAP[difficultyLevel] : null;

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

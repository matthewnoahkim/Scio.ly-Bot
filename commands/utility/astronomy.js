const { SlashCommandBuilder, ComponentType } = require('discord.js');
const {
  buildQuestionEmbed,
  createQuestionButtons,
  createAnswerModal,
  fetchQuestion,
  handleMCQCheck,
  handleFRQGrading,
  getExplanationWithRetry,
  COLORS,
  AUTH_HEADERS
} = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'astronomy';
const EVENT_NAME = 'Astronomy';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Solar System', 'Stars', 'Galaxies', 'Cosmology', 'Instruments'];
const ALLOW_IMAGES = false;

// Difficulty mapping
const DIFFICULTY_MAP = {
  'Very Easy (0-19%)': { min: 0, max: 0.19 },
  'Easy (20-39%)': { min: 0.2, max: 0.39 },
  'Medium (40-59%)': { min: 0.4, max: 0.59 },
  'Hard (60-79%)': { min: 0.6, max: 0.79 },
  'Very Hard (80-100%)': { min: 0.8, max: 1 }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription(`Get a ${EVENT_NAME} question`)
    .addStringOption(option =>
      option.setName('division')
        .setDescription('Division')
        .setRequired(false)
        .addChoices(...DIVISIONS.map(d => ({ name: `Division ${d}`, value: d })))
    )
    .addStringOption(option =>
      option.setName('subtopic')
        .setDescription('Subtopic')
        .setRequired(false)
        .addChoices(...ALLOWED_SUBTOPICS.map(s => ({ name: s, value: s })))
    )
    .addStringOption(option =>
      option.setName('question_type')
        .setDescription('Question type')
        .setRequired(false)
        .addChoices(
          { name: 'MCQ', value: 'mcq' },
          { name: 'FRQ', value: 'frq' }
        )
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
      const division = interaction.options.getString('division') || DIVISIONS[0];
      const subtopic = interaction.options.getString('subtopic') || 
        ALLOWED_SUBTOPICS[Math.floor(Math.random() * ALLOWED_SUBTOPICS.length)];
      const questionType = interaction.options.getString('question_type');
      const difficultyLevel = interaction.options.getString('difficulty');
      
      const difficulty = difficultyLevel ? DIFFICULTY_MAP[difficultyLevel] : null;

      // Fetch question
      const question = await fetchQuestion(EVENT_NAME, {
        division,
        subtopic,
        questionType,
        difficultyMin: difficulty?.min,
        difficultyMax: difficulty?.max
      });

      if (!question?.question) {
        await interaction.editReply('Question data is incomplete. Please try again.');
        return;
      }

      // Build and send response
      const embed = buildQuestionEmbed(question, EVENT_NAME, ALLOW_IMAGES);
      const components = [createQuestionButtons(question.id || interaction.id)];
      
      const sent = await interaction.editReply({ embeds: [embed], components });

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
            await handleCheckAnswer(buttonInteraction, question);
          } else if (buttonInteraction.customId === `explain_${questionId}`) {
            await handleExplainQuestion(buttonInteraction, question);
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
      console.error(`${COMMAND_NAME} command error:`, error);
      const errorMessage = error.message.includes('rate limit') 
        ? 'Rate limit exceeded. Please try again in a few moments.'
        : 'Command failed. Please try again later.';
      
      await interaction.editReply(errorMessage);
    }
  }
};

/**
 * Handle check answer button click
 */
async function handleCheckAnswer(interaction, question) {
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
 * Handle explain question button click
 */
async function handleExplainQuestion(interaction, question) {
  await interaction.deferReply();

  try {
    const explanation = await getExplanationWithRetry(question, EVENT_NAME, AUTH_HEADERS, COMMAND_NAME);
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

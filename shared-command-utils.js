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
  ComponentType,
  SlashCommandBuilder
} = require('discord.js');

const {
  letterFromIndex,
  getExplanationWithRetry,
  cleanLatexForDiscord,
  formatExplanationText
} = require('./shared-utils');
const { buildQuestionTypeChoices, handleIDQuestionLogic } = require('./shared-id-utils');
const {
  getDefaultDivision,
  supportsQuestionType,
  getFallbackDivision,
  getUnsupportedMessage
} = require('./event-capabilities');

// ===================== Constants =====================

const PRIMARY_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY;

const AUTH_HEADERS = API_KEY ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` } : {};
const COLORS = {
  BLUE: 0x2b90d9,
  GREEN: 0x3fbf7f,
  RED: 0xff5555
};
const MAX_CHOICES = 25; // Discord per-option hard limit

// Difficulty mapping used by all commands (MUST be defined before export)
const DIFFICULTY_MAP = {
  'Very Easy (0-19%)': { min: 0, max: 0.19 },
  'Easy (20-39%)': { min: 0.2, max: 0.39 },
  'Medium (40-59%)': { min: 0.4, max: 0.59 },
  'Hard (60-79%)': { min: 0.6, max: 0.79 },
  'Very Hard (80-100%)': { min: 0.8, max: 1 }
};

// ===================== Small utilities =====================

/** Make a short ASCII-safe id for Discord custom_id (<= 100 chars) */
function makeSafeId(raw) {
  const s = String(raw ?? '').replace(/[^\x20-\x7E]/g, '');
  return s.slice(-48) || 'qid';
}

/** Remove null/undefined values from an object */
function prune(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

/** Normalize answer data from API to ensure consistent format */
function normalizeAnswers(answers) {
  if (!answers) return [];
  if (!Array.isArray(answers)) answers = [answers];
  return answers.filter(a => a != null).map(a => (typeof a === 'string' ? a.trim() : a));
}

// ===================== Answer resolution & embeds =====================

/** Resolve the correct answer index for MCQ questions */
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

      if (typeof answer === 'number') {
        if (answer >= 0 && answer < options.length) return answer; // already 0-based
      }

      if (typeof answer === 'string') {
        const trimmed = answer.trim();

        // A/B/C/D
        if (trimmed.length === 1) {
          const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
          if (idx >= 0 && idx < options.length) return idx;
        }

        // match full text (case-insensitive)
        const lower = trimmed.toLowerCase();
        const exact = options.findIndex(opt => String(opt ?? '').trim().toLowerCase() === lower);
        if (exact !== -1) return exact;

        // partial tolerance
        const partial = options.findIndex(opt => {
          const s = String(opt ?? '').trim().toLowerCase();
          return s.includes(lower) || lower.includes(s);
        });
        if (partial !== -1) return partial;
      }
    }

    console.warn('Could not resolve correct index', {
      qid: question?.id,
      answers: question?.answers,
      options
    });
    return null;
  } catch (err) {
    console.error('resolveCorrectIndex error:', err);
    return null;
  }
}

/** Format elapsed time as MM:SS */
function formatElapsedTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Build a question embed (safe against Discord limits) */
function buildQuestionEmbed(question, eventName, allowImages = false, elapsedSeconds = 0) {
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
        fields.push({
          name: fields.length ? 'Answer Choices (cont.)' : 'Answer Choices',
          value: block,
          inline: false
        });
        block = line;
      } else {
        block = next;
      }
    }
    if (block) {
      fields.push({
        name: fields.length ? 'Answer Choices (cont.)' : 'Answer Choices',
        value: block,
        inline: false
      });
    }
  }

  fields.push(
    { name: 'Division', value: String(question.division ?? '—'), inline: true },
    {
      name: 'Difficulty',
      value: typeof question.difficulty === 'number' ? `${Math.round(question.difficulty * 100)}%` : '—',
      inline: true
    },
    {
      name: 'Time',
      value: `⏱️ ${formatElapsedTime(elapsedSeconds)}`,
      inline: true
    },
    {
      name: 'Subtopic(s)',
      value: Array.isArray(question.subtopics) && question.subtopics.length
        ? question.subtopics.join(', ').slice(0, 1024)
        : 'None',
      inline: true
    }
  );

  const qid = String(question?.base52 ?? question?.id ?? 'unknown-id');
  embed.addFields(fields).setFooter({ text: `Use the buttons below • QID: ${qid}` });

  if (allowImages) {
    if (question.imageData) embed.setImage(question.imageData);
    else if (Array.isArray(question.images) && question.images.length) embed.setImage(question.images[0]);
  }

  return embed;
}

/** Create action components (Delete on its own row) */
function createQuestionComponents(rawId) {
  const safeId = makeSafeId(rawId);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`check_${safeId}`).setLabel('Check answer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`explain_${safeId}`).setLabel('Explain question').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`delete_${safeId}`).setLabel('Delete question').setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

/** Ephemeral Yes/No buttons row for delete confirmation */
function buildDeleteConfirmRow(safeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm_yes_${safeId}`).setLabel('Yes, delete it').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`confirm_no_${safeId}`).setLabel('No, keep it').setStyle(ButtonStyle.Secondary)
  );
}

/** Pick the first question from API response data */
function pickFirstQuestion(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data.questions)) return data.questions[0] || null;
  if (data.id || data.base52 || data.question) return data;
  return null;
}

// ===================== API helpers =====================

/** Actual delete (no preview) + returns reasoning/decision */
async function deleteQuestion(question, eventName) {
  const body = { question, event: eventName };
  const res = await axios.post(`${PRIMARY_BASE}/api/report/remove`, body, {
    headers: AUTH_HEADERS,
    timeout: 30000
  });

  const success = res?.data?.success ?? (res?.status >= 200 && res?.status < 300);
  const decision = res?.data?.data?.decision ?? (success ? 'Approved' : 'Rejected');

  const reasoning =
    res?.data?.data?.reasoning ??
    res?.data?.data?.ai_reasoning ??
    res?.data?.reason ??
    res?.data?.message ??
    (success ? 'Removed.' : 'Not removed.');

  return { success, decision, reasoning, raw: res?.data };
}

/** Fetch a question (with light retry) */
async function fetchQuestion(eventName, options = {}) {
  const { division, subtopic, questionType, difficultyMin, difficultyMax, limit = 1 } = options;

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
  if (!response.data?.success) throw new Error('API returned unsuccessful response');

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
    if (fallbackResponse.data?.success) question = pickFirstQuestion(fallbackResponse.data.data);
  }

  if (!question) throw new Error('No questions found matching criteria');

  // Try to fetch detailed question data if needed
  if (!question.base52 && question.id) {
    try {
      const detail = await axios.get(`${PRIMARY_BASE}/api/questions/${question.id}`, {
        timeout: 15000,
        headers: AUTH_HEADERS
      });
      if (detail.data?.success && detail.data.data) question = detail.data.data;
    } catch { /* ignore detail fetch errors */ }
  }

  // Validate/normalize options
  if (question && Array.isArray(question.options) && question.options.length > 0) {
    const clean = s => String(s ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    question.options = question.options.map(clean).filter(Boolean);

    if (!question.answers || !Array.isArray(question.answers) || question.answers.length === 0) {
      console.warn('MCQ question missing answers:', { questionId: question.id, options: question.options });
    }
  }

  return question;
}

// ===================== Interactions =====================

/** Handle image processing for ID questions (and regular images) */
async function handleQuestionImages(question, embed, allowImages, isID) {
  const files = [];
  try {
    if (!allowImages) return files;

    const url = question?.imageData || (Array.isArray(question?.images) && question.images[0]);
    if (!url) return files;

    // For ID questions, try attaching the image as a file
    if (isID) {
      try {
        const imageResponse = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        const buffer = Buffer.from(imageResponse.data);
        const filename = `image_${Date.now()}.jpg`;
        files.push({ attachment: buffer, name: filename });
        embed.setImage(`attachment://${filename}`);
        return files;
      } catch {
        // fallback to URL
      }
    }

    embed.setImage(url);
  } catch (e) {
    console.warn('handleQuestionImages warning:', e?.message || e);
  }
  return files;
}

/** Handle MCQ answer checking */
function handleMCQCheck(question, userAnswer) {
  try {
    const options = question.options || [];
    if (!options.length) return { error: 'This question has no options — cannot check as MCQ.' };

    const firstLetter = String(userAnswer).trim().toUpperCase().match(/[A-Z]/)?.[0] ?? '';
    const index = firstLetter ? firstLetter.charCodeAt(0) - 65 : -1;
    if (!(index >= 0 && index < options.length)) {
      return { error: `Invalid choice. Please enter a letter between A and ${letterFromIndex(options.length - 1)}.` };
    }

    const correctIndex = resolveCorrectIndex(question);
    if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
      console.error('Invalid correctIndex resolved:', {
        questionId: question.id,
        correctIndex,
        optionsLength: options.length,
        answers: question.answers
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
        { name: 'Correct answer', value: `**${letterFromIndex(correctIndex)})** ${correctOption}`, inline: true }
      );

    return { embed, isCorrect };
  } catch (error) {
    console.error('Error in handleMCQCheck:', error);
    return { error: 'An error occurred while checking your answer. Please try again.' };
  }
}

/** Handle FRQ answer grading */
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
    gradingInstructions:
      "Be VERY lenient in grading. Award points for: 1) Any mention of key concepts, even with different terminology, 2) Synonyms and related terms (e.g., 'K+ efflux' = 'K+ moves out'), 3) Partial answers that show understanding, 4) Different but equivalent phrasings, 5) Detailed explanations that cover the expected concepts. Focus on whether the student understands the core concepts, not exact word matching. Award at least 40% if the answer demonstrates understanding of the main concepts, even if phrased differently."
  };

  try {
    const response = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, requestBody, {
      headers: AUTH_HEADERS,
      timeout: 30000
    });

    const grade = response.data?.data?.grades?.[0];
    let score = null;

    if (grade && typeof grade.score === 'number') score = grade.score;
    else if (response.data?.data?.scores?.[0] != null) score = response.data.data.scores[0];
    else if (grade && typeof grade.percentage === 'number') score = grade.percentage / 100;
    else throw new Error('Gemini grading service did not return a valid score');

    if (score < 0 || score > 1) score = Math.max(0, Math.min(1, score));

    const percentageScore = Math.round(score * 100);
    const isCorrect = percentageScore >= 50;

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
      .setFooter({ text: `AI Score: ${percentageScore}% • Threshold: 50%` });

    return { embed, isCorrect, score };
  } catch (error) {
    console.error('Gemini FRQ grading error:', error);
    if (error.response?.status === 429) throw new Error('Gemini grading service is rate-limited. Please try again in a moment.');
    if ([503, 502].includes(error.response?.status)) throw new Error('Gemini grading service is temporarily unavailable. Please try again shortly.');
    if ([401, 403].includes(error.response?.status)) throw new Error('Authentication failed for Gemini grading service. Please check your API configuration.');
    if (error.code === 'ECONNABORTED') throw new Error('Gemini grading request timed out. The AI service may be busy.');
    if (error.message.includes('did not return a valid score')) throw new Error('Gemini grading service returned an invalid response. Please try again.');
    throw new Error(`Gemini grading failed: ${error.message || 'Unknown error'}. Please try again shortly.`);
  }
}

/** Create answer check modal */
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

/** User-friendly error helpers (kept for external usage) */
function getGradingErrorMessage(error) {
  if (error?.response?.status === 429) return 'The grading service is rate-limited right now. Please try again in a moment.';
  if ([401, 403].includes(error?.response?.status)) return 'Authentication failed for grading. Check your API key.';
  if (error?.response?.status) return `Grading failed: HTTP ${error.response.status} - ${error.response.statusText || 'Unknown error'}. Please try again shortly.`;
  return `Grading failed: ${error?.message || 'Network or connection error'}. Please try again shortly.`;
}
function getExplanationErrorMessage(error) {
  if (error?.response?.status === 429) return 'The explanation service is rate-limited right now. Please try again in a moment.';
  if ([401, 403].includes(error?.response?.status)) return 'Authentication failed for explanation. Check your API key.';
  if (error?.response?.status) return `Could not fetch an explanation: HTTP ${error.response.status} - ${error.response.statusText || 'Unknown error'}. Please try again shortly.`;
  return `Could not fetch an explanation: ${error?.message || 'Network or connection error'}. Please try again shortly.`;
}

/** Handle check answer interaction (opens modal and grades) */
async function handleCheckAnswerInteraction(interaction, question) {
  try {
    if (!question || !question.question) {
      await interaction.reply({ content: 'Question data is invalid. Please try again.', ephemeral: true });
      return;
    }

    const isMCQ = Array.isArray(question.options) && question.options.length > 0;
    const modal = createAnswerModal(interaction.message.id, isMCQ);
    await interaction.showModal(modal); // ACKs the button interaction

    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        time: 5 * 60 * 1000,
        filter: i => i.customId === `check_modal_${interaction.message.id}` && i.user.id === interaction.user.id
      });

      const userAnswer = modalSubmit.fields.getTextInputValue('answer_input').trim();
      if (!userAnswer) {
        await modalSubmit.reply({ content: 'Please provide an answer.', ephemeral: true });
        return;
      }

      if (isMCQ) {
        const result = handleMCQCheck(question, userAnswer);
        if (result.error) {
          await modalSubmit.reply({ content: result.error, ephemeral: true });
          return;
        }
        await modalSubmit.reply({ embeds: [result.embed] });
      } else {
        await modalSubmit.deferReply();
        try {
          const result = await handleFRQGrading(question, userAnswer);
          await modalSubmit.editReply({ embeds: [result.embed] });
        } catch (error) {
          console.error('FRQ grading error:', error);
          await modalSubmit.editReply({ content: 'Grading failed. Please try again shortly.' });
        }
      }
    } catch (err) {
      if (err.code === 'INTERACTION_COLLECTOR_ERROR' || err.code === 10062) return;
      try {
        await interaction.followUp({ content: 'Something went wrong with the answer submission. Please try again.', ephemeral: true });
      } catch {}
    }
  } catch (error) {
    console.error('Error in handleCheckAnswerInteraction:', error);
    try {
      await interaction.reply({ content: 'Something went wrong. Please try again.', ephemeral: true });
    } catch {}
  }
}

/** Handle explain question interaction */
async function handleExplainQuestionInteraction(interaction, question, eventName, commandName) {
  await interaction.deferReply();
  try {
    const explanation = await getExplanationWithRetry(question, eventName, AUTH_HEADERS, commandName);
    const text = explanation || 'No explanation available.';
    const cleanedText = cleanLatexForDiscord(text);
    const formattedText = formatExplanationText(cleanedText);

    const embed = { color: COLORS.BLUE, title: 'Explanation' };
    const truncated = formattedText.length > 4096 ? formattedText.substring(0, 4093) + '...' : formattedText;
    embed.description = truncated;

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('Could not fetch an explanation at this time.');
  }
}

// ===================== Delete flow =====================

/** Handle the DELETE button -> ephemeral confirm -> Yes/No -> AI call -> response */
async function handleDeleteQuestionInteraction(buttonInteraction, safeId, question, eventName) {
  try {
    await buttonInteraction.deferReply({ ephemeral: true });

    const qid = String(question?.base52 ?? question?.id ?? 'unknown');
    const confirmEmbed = new EmbedBuilder()
      .setColor(COLORS.BLUE)
      .setTitle('Are you sure you want to delete this question?')
      .addFields(
        { name: 'Event', value: String(eventName), inline: true },
        { name: 'Question ID', value: qid, inline: true }
      );

    const ephemeralMsg = await buttonInteraction.editReply({
      embeds: [confirmEmbed],
      components: [buildDeleteConfirmRow(safeId)]
    });

    // Await Yes/No click on ephemeral
    const filter = (i) =>
      i.user.id === buttonInteraction.user.id &&
      (i.customId === `confirm_yes_${safeId}` || i.customId === `confirm_no_${safeId}`);

    let i;
    try {
      i = await ephemeralMsg.awaitMessageComponent({
        time: 60 * 1000,
        filter,
        componentType: ComponentType.Button
      });
    } catch {
      try { await buttonInteraction.editReply({ components: [] }); } catch {}
      await buttonInteraction.followUp({ content: 'Deletion timed out.', ephemeral: true });
      return;
    }

    await i.deferUpdate(); // ACK the click immediately

    if (i.customId === `confirm_no_${safeId}`) {
      try { await buttonInteraction.editReply({ components: [] }); } catch {}
      await buttonInteraction.followUp({ content: 'Deletion cancelled.', ephemeral: true });
      return;
    }

    // Perform delete
    let result;
    try {
      result = await deleteQuestion(question, eventName);
    } catch (err) {
      console.error('Delete request error:', err);
      await buttonInteraction.followUp({
        content: 'Deletion failed. Please try again shortly.',
        ephemeral: true
      });
      return;
    }

    // AI decision message
    const responseEmbed = new EmbedBuilder()
      .setColor(result.success ? COLORS.GREEN : COLORS.RED)
      .setTitle(result.success ? 'Question deleted' : 'Deletion rejected')
      .addFields(
        { name: 'AI decision', value: String(result.decision) },
        { name: 'AI reasoning', value: String(result.reasoning).slice(0, 1024) }
      );

    await buttonInteraction.followUp({ embeds: [responseEmbed], ephemeral: true });

    // Disable public buttons if success
    if (result.success) {
      try {
        const rows = Array.isArray(buttonInteraction.message?.components)
          ? buttonInteraction.message.components
          : [];
        const newComponents = rows.map(row => {
          const newRow = new ActionRowBuilder();
          const comps = Array.isArray(row?.components) ? row.components : [];
          for (const comp of comps) {
            if (comp?.type === 2) {
              newRow.addComponents(
                new ButtonBuilder()
                  .setCustomId(comp.customId ?? 'disabled')
                  .setLabel(comp.label ?? 'Button')
                  .setStyle(comp.style ?? ButtonStyle.Secondary)
                  .setDisabled(true)
              );
            }
          }
          return newRow;
        });
        await buttonInteraction.message.edit({ components: newComponents });
      } catch (e) {
        console.error('Failed to disable public buttons after deletion:', e);
      }
    }

    try { await buttonInteraction.editReply({ components: [] }); } catch {}
  } catch (err) {
    console.error('handleDeleteQuestionInteraction error:', err);
    try {
      if (!buttonInteraction.replied && !buttonInteraction.deferred) {
        await buttonInteraction.reply({ content: 'Something went wrong. Please try again.', ephemeral: true });
      } else {
        await buttonInteraction.followUp({ content: 'Something went wrong. Please try again.', ephemeral: true });
      }
    } catch {}
  }
}

// ===================== Command factory =====================

function createSciOlyCommand(config) {
  const {
    commandName,
    eventName,
    divisions,
    allowedSubtopics,
    allowImages = false
  } = config;

  return {
    data: new SlashCommandBuilder()
      .setName(commandName)
      .setDescription(`Get a ${eventName} question`)
      .addStringOption(option =>
        option.setName('question_type')
          .setDescription('Question type')
          .setRequired(false)
          .addChoices(...((buildQuestionTypeChoices(allowImages) || []).slice(0, MAX_CHOICES)))
      )
      .addStringOption(option =>
        option.setName('division')
          .setDescription('Division')
          .setRequired(false)
          .addChoices(...((divisions || []).slice(0, MAX_CHOICES).map(d => ({ name: `Division ${d}`, value: d }))))
      )
      .addStringOption(option =>
        option.setName('difficulty')
          .setDescription('Difficulty')
          .setRequired(false)
          .addChoices(...(Object.keys(DIFFICULTY_MAP).slice(0, MAX_CHOICES).map(d => ({ name: d, value: d }))))
      )
      .addStringOption(option =>
        option.setName('subtopic')
          .setDescription('Subtopic')
          .setRequired(false)
          .addChoices(...((allowedSubtopics || []).slice(0, MAX_CHOICES).map(s => ({
            name: String(s).slice(0, 100),
            value: String(s).slice(0, 100)
          }))))
      ),

    async execute(interaction) {
      try {
        await interaction.deferReply(); // must ACK within 3s

        // Parse options with smart defaults
        let division = interaction.options.getString('division') || getDefaultDivision(eventName);
        const subtopic = interaction.options.getString('subtopic');
        const questionType = interaction.options.getString('question_type');
        const difficultyLevel = interaction.options.getString('difficulty');
        const difficulty = difficultyLevel ? DIFFICULTY_MAP[difficultyLevel] : null;

        // Validate requested combo
        if (questionType && !supportsQuestionType(eventName, division, questionType)) {
          const fallbackDivision = getFallbackDivision(eventName, division, questionType);
          const unsupportedMessage = getUnsupportedMessage(eventName, division, questionType);
          if (fallbackDivision !== division) {
            division = fallbackDivision;
            await interaction.followUp({ content: unsupportedMessage, ephemeral: true });
          }
        }

        let question;
        let isID = false;

        if (questionType === 'id') {
          try {
            const result = await handleIDQuestionLogic(
              eventName,
              questionType,
              division,
              subtopic,
              difficulty?.min,
              difficulty?.max,
              AUTH_HEADERS
            );
            if (!result.question) {
              await interaction.editReply('No identification questions found for your filters. Try different filters.');
              return;
            }
            question = result.question;
            isID = result.isID;
          } catch {
            // Fallback to a regular MCQ if ID not supported
            question = await fetchQuestion(eventName, {
              division,
              subtopic,
              questionType: 'mcq',
              difficultyMin: difficulty?.min,
              difficultyMax: difficulty?.max
            });
            isID = false;
          }
        } else {
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

        const embed = buildQuestionEmbed(question, eventName, allowImages, 0);
        const files = await handleQuestionImages(question, embed, allowImages, isID);

        // Build components with a safe id
        const safeId = makeSafeId(question.base52 || question.id || interaction.id);
        const components = createQuestionComponents(safeId);

        const sent = await interaction.editReply({
          embeds: [embed],
          components,
          ...(files.length > 0 && { files })
        });

        // Start timer
        const startTime = Date.now();
        let timerInterval = null;

        const updateTimer = async () => {
          try {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const updatedEmbed = buildQuestionEmbed(question, eventName, allowImages, elapsedSeconds);
            await sent.edit({
              embeds: [updatedEmbed],
              components: sent.components,
              ...(files.length > 0 && { files })
            });
          } catch (error) {
            // Message may have been deleted or edited, stop timer
            if (timerInterval) {
              clearInterval(timerInterval);
              timerInterval = null;
            }
          }
        };

        // Update timer every 2 seconds to avoid rate limits
        timerInterval = setInterval(updateTimer, 2000);

        // Collector for public buttons on the sent message
        const collector = sent.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 30 * 60 * 1000,
          filter: i => i.message.id === sent.id
        });

        // Stop on message delete
        const onDelete = (msg) => {
          if (msg.id === sent.id) {
            collector.stop('message_deleted');
            interaction.client.off('messageDelete', onDelete);
            if (timerInterval) {
              clearInterval(timerInterval);
              timerInterval = null;
            }
          }
        };
        interaction.client.on('messageDelete', onDelete);
        collector.on('end', () => {
          interaction.client.off('messageDelete', onDelete);
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
        });

        collector.on('collect', async (buttonInteraction) => {
          try {
            if (buttonInteraction.user.id !== interaction.user.id) {
              await buttonInteraction.reply({ content: 'Only the original requester can use these buttons.', ephemeral: true });
              return;
            }

            const customId = buttonInteraction.customId;
            if (customId === `check_${safeId}`) {
              await handleCheckAnswerInteraction(buttonInteraction, question);
            } else if (customId === `explain_${safeId}`) {
              await handleExplainQuestionInteraction(buttonInteraction, question, eventName, commandName);
            } else if (customId === `delete_${safeId}`) {
              await handleDeleteQuestionInteraction(buttonInteraction, safeId, question, eventName);
            }
          } catch (err) {
            console.error('Button interaction error:', err);
            try {
              if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                await buttonInteraction.reply({ content: 'Something went wrong handling that action.', ephemeral: true });
              }
            } catch (replyErr) {
              console.error('Failed to send error reply:', replyErr);
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

// ===================== Exports =====================

module.exports = {
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
  createSciOlyCommand
};

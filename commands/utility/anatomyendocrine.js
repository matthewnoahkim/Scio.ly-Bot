const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType
} = require('discord.js');
const axios = require('axios');
const { letterFromIndex, getExplanationWithRetry } = require('../../shared-utils');
const {
  getDivisions,
  buildQuestionTypeChoices,
  handleIDQuestionLogic
} = require('../../shared-id-utils');

const COMMAND_NAME = 'anatomyendocrine';
const EVENT_NAME = 'Anatomy - Endocrine';
const DIVISIONS = getDivisions(EVENT_NAME);
const ALLOWED_SUBTOPICS = ["Hormones","Glands","Regulation","Diseases","Feedback Loops"];
const ALLOW_IMAGES = true;

const API_BASE = 'https://scio.ly';
const API_KEY = process.env.SCIO_API_KEY;
const AUTH_HEADERS = API_KEY ? { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` } : {};

const COLORS = {
  BLUE: 0x2b90d9,
  GREEN: 0x3fbf7f,
  RED: 0xff5555
};

// -------------------- Helper Functions --------------------
const letter = (n) => letterFromIndex(n);

function prune(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

function resolveCorrectIndex(question) {
  const { options = [], answers = [] } = question || {};
  if (!options.length) return null;

  const firstAnswer = answers?.[0];

  if (typeof firstAnswer === 'number') {
    return (firstAnswer >= 0 && firstAnswer < options.length)
      ? firstAnswer
      : 0;
  }

  if (typeof firstAnswer === 'string') {
    const normalized = firstAnswer.trim().toLowerCase();
    const index = options.findIndex(o => String(o).trim().toLowerCase() === normalized);
    return index !== -1 ? index : 0;
  }

  return 0;
}

function buildButtonsRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`check_${id}`).setLabel('Check Answer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`explain_${id}`).setLabel('Explain Question').setStyle(ButtonStyle.Secondary)
  );
}

function buildQuestionEmbed(question, isID, imageUrl = null) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(EVENT_NAME)
    .setDescription(question.question || 'No question text');

  if (Array.isArray(question.options) && question.options.length) {
    embed.addFields({
      name: 'Answer Choices',
      value: question.options.map((opt, i) => `**${letter(i)})** ${opt}`).join('\n'),
      inline: false
    });
  }

  embed.addFields(
    { name: 'Division', value: String(question.division ?? '—'), inline: true },
    { name: 'Difficulty', value: typeof question.difficulty === 'number' ? `${Math.round(question.difficulty * 100)}%` : '—', inline: true },
    { name: 'Subtopics', value: Array.isArray(question.subtopics) && question.subtopics.length ? question.subtopics.join(', ') : 'None', inline: true }
  );

  if (imageUrl) embed.setImage(imageUrl);
  embed.setFooter({ text: 'Use the buttons below.' });

  return embed;
}

// -------------------- Main Command --------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription(`Get a ${EVENT_NAME} question`)
    .addStringOption(option =>
      option.setName('division').setDescription('Division').addChoices(...DIVISIONS.map(d => ({ name: `Division ${d}`, value: d }))))
    .addStringOption(option =>
      option.setName('subtopic').setDescription('Subtopic').addChoices(...ALLOWED_SUBTOPICS.map(s => ({ name: s, value: s }))))
    .addStringOption(option =>
      option.setName('question_type').setDescription('Question Type').addChoices(...buildQuestionTypeChoices(ALLOW_IMAGES)))
    .addStringOption(option =>
      option.setName('difficulty').setDescription('Difficulty').addChoices(
        { name: 'Very Easy (0-19%)', value: 'Very Easy (0-19%)' },
        { name: 'Easy (20-39%)', value: 'Easy (20-39%)' },
        { name: 'Medium (40-59%)', value: 'Medium (40-59%)' },
        { name: 'Hard (60-79%)', value: 'Hard (60-79%)' },
        { name: 'Very Hard (80-100%)', value: 'Very Hard (80-100%)' }
      )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const questionType = interaction.options.getString('question_type');
      const division = interaction.options.getString('division') || DIVISIONS[0];
      const subtopic = interaction.options.getString('subtopic') || (questionType !== 'ID' ? ALLOWED_SUBTOPICS[Math.floor(Math.random() * ALLOWED_SUBTOPICS.length)] : undefined);
      const difficulty = interaction.options.getString('difficulty');

      const difficultyMap = {
        'Very Easy (0-19%)': { min: 0, max: 0.19 },
        'Easy (20-39%)': { min: 0.2, max: 0.39 },
        'Medium (40-59%)': { min: 0.4, max: 0.59 },
        'Hard (60-79%)': { min: 0.6, max: 0.79 },
        'Very Hard (80-100%)': { min: 0.8, max: 1 }
      };

      const minDifficulty = difficulty ? difficultyMap[difficulty].min : undefined;
      const maxDifficulty = difficulty ? difficultyMap[difficulty].max : undefined;

      // Fetch question
      const { question, isID } = await handleIDQuestionLogic(EVENT_NAME, questionType, division, subtopic, minDifficulty, maxDifficulty, AUTH_HEADERS);
      if (!question?.question) {
        await interaction.editReply('No questions found. Try different filters.');
        return;
      }

      let embed;
      const files = [];

      if (isID && question.images?.length > 0) {
        const imageUrl = question.images[0];
        try {
          const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
          const buffer = Buffer.from(imageResponse.data);
          const filename = `image_${Date.now()}.jpg`;

          files.push({ attachment: buffer, name: filename });
          embed = buildQuestionEmbed(question, isID, `attachment://${filename}`);
        } catch {
          embed = buildQuestionEmbed(question, isID, imageUrl);
        }
      } else {
        embed = buildQuestionEmbed(question, isID);
      }

      const sent = await interaction.editReply({ embeds: [embed], components: [buildButtonsRow(question.id || interaction.id)], files });

      // Component collector
      const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30 * 60 * 1000, filter: i => i.message.id === sent.id });

      collector.on('collect', async (btn) => {
        try {
          if (btn.user.id !== interaction.user.id) {
            await btn.reply({ content: 'Only the original requester can use these buttons.', ephemeral: true });
            return;
          }

          if (btn.customId === `check_${question.id || interaction.id}`) {
            const isMCQ = Array.isArray(question.options) && question.options.length > 0;
            const modalId = `check_modal_${sent.id}`;
            const modal = new ModalBuilder().setCustomId(modalId).setTitle('Check your answer');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('answer_input').setLabel(isMCQ ? 'Your answer (A, B, C, ...)' : 'Your answer').setStyle(isMCQ ? TextInputStyle.Short : TextInputStyle.Paragraph).setRequired(true).setPlaceholder(isMCQ ? 'e.g., A' : 'Type your free-response here')));
            await btn.showModal(modal);
            let sub;
            try {
              sub = await btn.awaitModalSubmit({ time: 5 * 60 * 1000, filter: i => i.customId === modalId && i.user.id === interaction.user.id });
            } catch {
              return;
            }
            const userAnswer = String(sub.fields.getTextInputValue('answer_input') || '').trim();

            if (isMCQ) {
              const opts = question.options || [];
              if (!opts.length) {
                await sub.reply('This question has no options — cannot check as MCQ.');
                return;
              }
              const L = (userAnswer[0] || '').toUpperCase();
              const idx = L.charCodeAt(0) - 65;
              if (!(idx >= 0 && idx < opts.length)) {
                await sub.reply(`Invalid choice. Please enter a letter between A and ${letter(opts.length - 1)}.`);
                return;
              }
              const cIdx = resolveCorrectIndex(question);
              const correct = idx === cIdx;
              const res = new EmbedBuilder().setColor(correct ? COLORS.GREEN : COLORS.RED).setTitle(correct ? '✅ Correct!' : '❌ Wrong.').addFields(
                { name: 'Your answer', value: `**${letter(idx)})** ${opts[idx]}`, inline: true },
                { name: 'Correct answer', value: `**${letter(cIdx)})** ${opts[cIdx]}`, inline: true },
              );
              await sub.reply({ embeds: [res] });
            } else {
              try {
                const correctAnswers = Array.isArray(question.answers) ? question.answers.map(String) : (typeof question.answers === 'string' ? [question.answers] : []);
                const body = { responses: [{ question: question.question, correctAnswers, studentAnswer: userAnswer }] };
                const g = await axios.post(`${API_BASE}/api/gemini/grade-free-responses`, body, { headers: AUTH_HEADERS });
                const grade = g.data?.data?.grades?.[0];
                let score = null;
                if (grade && typeof grade.score === 'number') score = grade.score;
                else if (g.data?.data?.scores?.[0] != null) score = g.data.data.scores[0];
                else {
                  await sub.reply('Grading service did not return a result. Please try again shortly.');
                  return;
                }
                const isCorrect = Math.round(score * 100) > 50;
                const expected = correctAnswers.length ? (correctAnswers.join('; ').slice(0, 1000) + (correctAnswers.join('; ').length > 1000 ? '…' : '')) : '—';
                const res = new EmbedBuilder().setColor(isCorrect ? COLORS.GREEN : COLORS.RED).setTitle(isCorrect ? '✅ Correct!' : '❌ Wrong.').addFields(
                  { name: 'Your answer', value: userAnswer.slice(0, 1024) || '—', inline: false },
                  { name: 'Expected answer', value: expected || '—', inline: false },
                );
                await sub.reply({ embeds: [res] });
              } catch (err) {
                if (err?.response?.status === 429) await sub.reply('⏳ The grading service is rate-limited right now. Please try again in a moment.');
                else if (err?.response?.status === 401 || err?.response?.status === 403) await sub.reply('🔒 Authentication failed for grading. Check your API key.');
                else if (err?.response?.status) await sub.reply(`Grading failed: HTTP ${err.response.status} - ${err.response.statusText || 'Unknown error'}. Please try again shortly.`);
                else await sub.reply(`Grading failed: ${err?.message || 'Network or connection error'}. Please try again shortly.`);
              }
            }
          } else if (btn.customId === `explain_${question.id || interaction.id}`) {
            await btn.deferReply();
            try {
              const explanation = await getExplanationWithRetry(question, EVENT_NAME, AUTH_HEADERS, COMMAND_NAME);
              const text = explanation || 'No explanation available.';
              const e = new EmbedBuilder().setColor(COLORS.BLUE).setTitle('📘 Explanation');
              if (text.length <= 4096) {
                e.setDescription(text);
                await btn.editReply({ embeds: [e] });
              } else {
                e.setDescription('The full explanation is attached as a file below.');
                await btn.editReply({ embeds: [e], files: [{ attachment: Buffer.from(text, 'utf-8'), name: 'explanation.txt' }] });
              }
            } catch (err) {
              if (err?.response?.status === 429) await btn.editReply('⏳ The explanation service is rate-limited right now. Please try again in a moment.');
              else if (err?.response?.status === 401 || err?.response?.status === 403) await btn.editReply('🔒 Authentication failed for explanation. Check your API key.');
              else if (err?.response?.status) await btn.editReply(`Could not fetch an explanation: HTTP ${err.response.status} - ${err.response.statusText || 'Unknown error'}. Please try again shortly.`);
              else await btn.editReply(`Could not fetch an explanation: ${err?.message || 'Network or connection error'}. Please try again shortly.`);
            }
          }
        } catch (e) {
          try {
            if (!btn.replied && !btn.deferred) await btn.reply('Something went wrong handling that action.');
          } catch {}
        }
      });
    } catch (err) {
      if (err?.response?.status === 429) {
        await interaction.editReply('Rate limit exceeded. Please try again later.');
      } else {
        await interaction.editReply('Something went wrong. Please try again later.');
      }
    }
  }
};

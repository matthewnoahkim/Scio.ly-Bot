const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check your answer to a question')
    .addStringOption(option =>
      option.setName('question_id')
        .setDescription('Question ID')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('answer')
        .setDescription('Your answer')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const questionIdRaw = interaction.options.getString('question_id');
      const userAnswerRaw = interaction.options.getString('answer');

      const questionId = questionIdRaw.trim();

      let question;
      try {
        const qRes = await axios.get(`https://scio.ly/api/questions/base52/${encodeURIComponent(questionId)}`, { timeout: 15000 });
        if (!qRes.data?.success || !qRes.data.data) {
          return interaction.editReply({ content: 'Question not found. Please check the question ID.' });
        }
        question = qRes.data.data;
      } catch (err) {
        if (err.response?.status === 404) {
          return interaction.editReply({ content: 'Question not found. Please check the question ID.' });
        }
        throw err;
      }

      const isMCQ = (question.question_type?.toLowerCase() === 'mcq') ||
                    (Array.isArray(question.options) && question.options.length > 0);

      const normalize = (s) => String(s ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

      const letters = (n) => String.fromCharCode(65 + n);
      const findIndexByText = (text, opts) => {
        const target = normalize(text);
        for (let i = 0; i < opts.length; i++) {
          if (normalize(opts[i]) === target) return i;
        }
        return -1;
      };

      const parseUserToLetters = (input, optsLen) => {
        const tokens = String(input)
          .split(/[^A-Za-z0-9]+/g)
          .filter(Boolean);

        const out = new Set();
        for (const tRaw of tokens) {
          const t = tRaw.trim();

          if (/^[A-Za-z]$/.test(t)) {
            const idx = t.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < optsLen) out.add(letters(idx));
            continue;
          }

          if (/^\d+$/.test(t)) {
            const num = parseInt(t, 10);
            if (num >= 1 && num <= optsLen) out.add(letters(num - 1));
            else if (num >= 0 && num < optsLen) out.add(letters(num));
            continue;
          }

        }
        return out;
      };

      const buildCorrectLetters = (answers, options = []) => {
        const out = new Set();
        const optsLen = options.length;

        const arr = Array.isArray(answers) ? answers : (answers != null ? [answers] : []);
        for (const a of arr) {
          if (typeof a === 'number' || (typeof a === 'string' && /^\d+$/.test(a))) {
            const n = typeof a === 'number' ? a : parseInt(a, 10);
            if (optsLen > 0) {
              if (n >= 0 && n < optsLen) out.add(letters(n));     
              else if (n >= 1 && n <= optsLen) out.add(letters(n-1));
            }
            continue;
          }

          if (typeof a === 'string' && /^[A-Za-z]$/.test(a)) {
            const idx = a.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < optsLen) out.add(letters(idx));
            continue;
          }

          if (typeof a === 'string' && optsLen > 0) {
            const idx = findIndexByText(a, options);
            if (idx !== -1) out.add(letters(idx));
          }
        }
        return out;
      };

      const formatCorrectForDisplay = (lettersSet, options = []) => {
        if (!lettersSet || lettersSet.size === 0) return '—';
        const items = [...lettersSet].sort().map(L => {
          const idx = L.charCodeAt(0) - 65;
          const text = options[idx] ?? '';
          return text ? `${L}) ${text}` : L;
        });
        return items.join(', ');
      };

      let isCorrect = false;
      let correctDisplay = '';
      const userAnswer = userAnswerRaw.trim();

      if (isMCQ) {
        const options = Array.isArray(question.options) ? question.options : [];
        const correctLetters = buildCorrectLetters(question.answers, options);
        const userLetters = parseUserToLetters(userAnswer, options.length);

        if (userLetters.size === 0 && options.length > 0) {
          const idxFromText = findIndexByText(userAnswer, options);
          if (idxFromText !== -1) userLetters.add(letters(idxFromText));
        }

        const sameSize = userLetters.size === correctLetters.size;
        const allIn = [...userLetters].every(L => correctLetters.has(L));
        isCorrect = sameSize && allIn;

        correctDisplay = formatCorrectForDisplay(correctLetters, options);
      } else {
        try {
          const gradeResponse = await axios.post(
            'https://scio.ly/api/gemini/grade-free-responses',
            {
              freeResponses: [{
                question,
                correctAnswers: Array.isArray(question.answers) ? question.answers : (question.answers != null ? [question.answers] : []),
                studentAnswer: userAnswer
              }]
            },
            { timeout: 20000 }
          );

          const item = gradeResponse.data?.data?.[0];
          isCorrect = Boolean(item?.isCorrect);

          const raw = Array.isArray(question.answers) ? question.answers : (question.answers != null ? [question.answers] : []);
          correctDisplay = raw.length ? raw.join(', ') : '—';
        } catch (gradeError) {
          console.error('Error grading FRQ:', gradeError);
          return interaction.editReply({ content: 'Grading failed. Please try again in a few moments.' });
        }
      }

      const embed = new EmbedBuilder()
        .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
        .setTitle(isCorrect ? 'Correct!' : 'Wrong')
        .setDescription(`**Question:** ${question.question ?? '—'}`)
        .addFields(
          { name: 'Your Answer', value: userAnswer || '—', inline: true },
          { name: 'Correct Answer(s)', value: correctDisplay || '—', inline: true },
          { name: 'Question ID', value: question.base52 || questionId, inline: false }
        )
        .setFooter({ text: 'Use /explain to explain the question!' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in Check command:', error);
      if (error.response?.status === 429) {
        await interaction.editReply({ content: 'Rate limit exceeded. Please try again in a few moments.' });
      } else {
        await interaction.editReply({ content: 'Command failed. Please try again later.' });
      }
    }
  },
};
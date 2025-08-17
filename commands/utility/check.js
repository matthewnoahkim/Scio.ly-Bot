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
        .setDescription('Your answer (e.g., A or A,C or text)')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const questionId = interaction.options.getString('question_id').trim();
      const userAnswer = interaction.options.getString('answer').trim();

      let question;
      try {
        const qRes = await axios.get(
          `https://scio.ly/api/questions/base52/${encodeURIComponent(questionId)}`,
          { timeout: 15000 }
        );
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

      const getQuestionText = (q) => {
        const v = q?.question;
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          if (typeof v.text === 'string') return v.text;
          if (typeof v.content === 'string') return v.content;
          if (Array.isArray(v.parts)) return v.parts.join(' ');
          return JSON.stringify(v);
        }
        return '—';
      };

      const getOptions = (q) => {
        const opts = Array.isArray(q?.options) ? q.options : [];
        return opts.map(o =>
          typeof o === 'string' ? o
          : (o?.text ?? o?.label ?? String(o))
        );
      };

      const getAnswers = (q) => {
        const raw = Array.isArray(q?.answers) ? q.answers
                   : (q?.answers != null ? [q.answers] : []);
        return raw.map(a =>
          (typeof a === 'string' || typeof a === 'number') ? a
          : (a?.text ?? a?.value ?? String(a))
        );
      };

      const qText = getQuestionText(question);
      const options = getOptions(question);
      const answers = getAnswers(question);

      const isMCQ = (question.question_type?.toLowerCase() === 'mcq') ||
                    (options.length > 0);

      const norm = (s) => String(s ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/['"‘’“”`]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\b(the|a|an)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const letterOf = (idx) => String.fromCharCode(65 + idx); // 0 -> A
      const findIndexByText = (text, opts) => {
        const t = norm(text);
        for (let i = 0; i < opts.length; i++) {
          if (norm(opts[i]) === t) return i;
        }
        return -1;
      };

      const buildCorrectLetterSet = (answersArr, opts) => {
        const out = new Set();
        for (const a of answersArr) {
          if (typeof a === 'number' || (typeof a === 'string' && /^\d+$/.test(a))) {
            const n = typeof a === 'number' ? a : parseInt(a, 10);
            if (n >= 0 && n < opts.length) out.add(letterOf(n));        // 0-based
            else if (n >= 1 && n <= opts.length) out.add(letterOf(n-1)); // 1-based
            continue;
          }
          if (typeof a === 'string' && /^[A-Za-z]$/.test(a)) {
            const idx = a.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < opts.length) out.add(letterOf(idx));
            continue;
          }
          if (typeof a === 'string') {
            const idx = findIndexByText(a, opts);
            if (idx !== -1) out.add(letterOf(idx));
          }
        }
        return out;
      };

      const parseUserLetters = (input, optsLen, opts) => {
        const tokens = String(input)
          .split(/[^A-Za-z0-9]+/g)
          .filter(Boolean);

        const out = new Set();
        for (const raw of tokens) {
          const t = raw.trim();

          if (/^[A-Za-z]$/.test(t)) {
            const idx = t.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < optsLen) out.add(letterOf(idx));
            continue;
          }

          if (/^\d+$/.test(t)) {
            const num = parseInt(t, 10);
            if (num >= 1 && num <= optsLen) out.add(letterOf(num - 1));
            else if (num >= 0 && num < optsLen) out.add(letterOf(num));
            continue;
          }
        }

        if (out.size === 0 && optsLen > 0) {
          const idx = findIndexByText(input, opts);
          if (idx !== -1) out.add(letterOf(idx));
        }

        return out;
      };

      const formatCorrectDisplay = (lettersSet, opts) => {
        if (!lettersSet || lettersSet.size === 0) return '—';
        return [...lettersSet].sort().map(L => {
          const idx = L.charCodeAt(0) - 65;
          const text = opts[idx] ?? '';
          return text ? `${L}) ${text}` : L;
        }).join(', ');
      };

      let isCorrect = false;
      let correctDisplay = '—';

      if (isMCQ) {
        const correctLetters = buildCorrectLetterSet(answers, options);
        const userLetters = parseUserLetters(userAnswer, options.length, options);

        const sameSize = userLetters.size === correctLetters.size;
        const allIn = [...userLetters].every(L => correctLetters.has(L));
        isCorrect = sameSize && allIn;

        correctDisplay = formatCorrectDisplay(correctLetters, options);

      } else {
        const trimmedQuestion = {
          id: question.id,
          base52: question.base52,
          question: qText,
          event: question.event,
          division: question.division,
          subtopics: question.subtopics,
          difficulty: question.difficulty
        };

        const correctArr = answers;

        let gradedOK = false;
        try {
          const gradeResponse = await axios.post(
            'https://scio.ly/api/gemini/grade-free-responses',
            { freeResponses: [{ question: trimmedQuestion, correctAnswers: correctArr, studentAnswer: userAnswer }] },
            { timeout: 20000, headers: { 'Content-Type': 'application/json' } }
          );

          const payload = gradeResponse.data;
          const maybeArray =
            payload?.data ??
            payload?.graded ??
            payload?.result ??
            payload?.results ??
            (Array.isArray(payload) ? payload : null) ??
            (Array.isArray(payload?.data?.results) ? payload.data.results : null);

          const first = Array.isArray(maybeArray) ? maybeArray[0] : null;
          if (first && (typeof first.isCorrect === 'boolean' || typeof first.correct === 'boolean')) {
            isCorrect = Boolean(first.isCorrect ?? first.correct);
            gradedOK = true;
          }
        } catch (e) {
        }

        if (!gradedOK) {
          const u = norm(userAnswer);
          isCorrect = correctArr.some(ans => u && u.length > 0 && u === norm(ans));
        }

        correctDisplay = correctArr.length
          ? correctArr.map(a => (typeof a === 'string' ? a : String(a))).join(', ')
          : '—';
      }

      const embed = new EmbedBuilder()
        .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
        .setTitle(isCorrect ? 'Correct!' : 'Wrong')
        .setDescription(`**Question:** ${qText}`)
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

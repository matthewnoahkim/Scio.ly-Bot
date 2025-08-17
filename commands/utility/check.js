const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check your answer to a question')
    .addStringOption(option =>
      option.setName('question_id')
        .setDescription('Base-52 question ID (e.g., CuPaS)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('answer')
        .setDescription('Your answer (e.g., A or A,C or text)')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Public message (no ephemeral)
      await interaction.deferReply();

      const questionIdRaw = interaction.options.getString('question_id');
      const userAnswerRaw = interaction.options.getString('answer');

      const questionId = questionIdRaw.trim();
      const userAnswer = userAnswerRaw.trim();

      // --- Fetch question by base-52 id, handle 404 cleanly ---
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
        throw err; // bubble up other errors
      }

      // ---------- Helpers ----------
      const isMCQ = (question.question_type?.toLowerCase() === 'mcq') ||
                    (Array.isArray(question.options) && question.options.length > 0);

      const norm = (s) => String(s ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/['"‘’“”`]/g, '')       // strip quotes
        .replace(/[^a-z0-9\s]/g, ' ')    // drop punctuation
        .replace(/\b(the|a|an)\b/g, ' ') // drop articles
        .replace(/\s+/g, ' ')
        .trim();

      const letters = (n) => String.fromCharCode(65 + n); // 0 -> A
      const findIndexByText = (text, opts) => {
        const t = norm(text);
        for (let i = 0; i < opts.length; i++) {
          if (norm(opts[i]) === t) return i;
        }
        return -1;
      };

      const parseUserToLetters = (input, optsLen) => {
        const tokens = String(input)
          .split(/[^A-Za-z0-9]+/g)
          .filter(Boolean);

        const out = new Set();
        for (const raw of tokens) {
          const t = raw.trim();

          // Letter?
          if (/^[A-Za-z]$/.test(t)) {
            const idx = t.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < optsLen) out.add(letters(idx));
            continue;
          }

          // Number? accept 1-based and 0-based
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
        const arr = Array.isArray(answers) ? answers : (answers != null ? [answers] : []);
        for (const a of arr) {
          if (typeof a === 'number' || (typeof a === 'string' && /^\d+$/.test(a))) {
            const n = typeof a === 'number' ? a : parseInt(a, 10);
            if (n >= 0 && n < options.length) out.add(letters(n));        // 0-based
            else if (n >= 1 && n <= options.length) out.add(letters(n-1)); // 1-based
            continue;
          }
          if (typeof a === 'string' && /^[A-Za-z]$/.test(a)) {
            const idx = a.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < options.length) out.add(letters(idx));
            continue;
          }
          if (typeof a === 'string' && options.length > 0) {
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

      // ---------- Grade ----------
      let isCorrect = false;
      let correctDisplay = '—';

      if (isMCQ) {
        const options = Array.isArray(question.options) ? question.options : [];
        const correctLetters = buildCorrectLetters(question.answers, options);
        const userLetters = parseUserToLetters(userAnswer, options.length);

        // If no A/B/C from user, try text-match against options
        if (userLetters.size === 0 && options.length > 0) {
          const idxFromText = findIndexByText(userAnswer, options);
          if (idxFromText !== -1) userLetters.add(letters(idxFromText));
        }

        const sameSize = userLetters.size === correctLetters.size;
        const allIn = [...userLetters].every(L => correctLetters.has(L));
        isCorrect = sameSize && allIn;

        correctDisplay = formatCorrectForDisplay(correctLetters, options);

      } else {
        // FRQ: try AI endpoint first with a TRIMMED payload to avoid large bodies
        const correctArr = Array.isArray(question.answers) ? question.answers
                          : (question.answers != null ? [question.answers] : []);

        const trimmedQuestion = {
          id: question.id,
          base52: question.base52,
          question: question.question,
          event: question.event,
          division: question.division,
          subtopics: question.subtopics,
          difficulty: question.difficulty
          // (omit options, long fields, metadata, etc.)
        };

        let gradedOK = false;
        try {
          const gradeResponse = await axios.post(
            'https://scio.ly/api/gemini/grade-free-responses',
            { freeResponses: [{ question: trimmedQuestion, correctAnswers: correctArr, studentAnswer: userAnswer }] },
            { timeout: 20000, headers: { 'Content-Type': 'application/json' } }
          );

          // Accept several possible shapes
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
          // fall through to local grading
          console.error('AI grade error:', e?.response?.status, e?.response?.data || e.message);
        }

        // Fallback local grader (strict normalized equality against any expected)
        if (!gradedOK) {
          const u = norm(userAnswer);
          isCorrect = correctArr.some(ans => u && u.length > 0 && u === norm(ans));
        }

        correctDisplay = correctArr.length ? correctArr.join(', ') : '—';
      }

      // ---------- Reply ----------
      const embed = new EmbedBuilder()
        .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
        .setTitle(isCorrect ? '✅ Correct!' : '❌ Incorrect')
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
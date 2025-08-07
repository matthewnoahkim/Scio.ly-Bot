const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check your answer to a question')
        .addStringOption(option =>
            option.setName('question_id')
                .setDescription('The ID of the question to check')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('answer')
                .setDescription('Your answer')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const questionId = interaction.options.getString('question_id');
            const userAnswer = interaction.options.getString('answer');

            const questionResponse = await axios.get(`https://scio.ly/api/questions/${questionId}`);
            
            if (!questionResponse.data.success) {
                return await interaction.editReply({
                    content: 'Question not found. Please check the question ID.',
                    ephemeral: true
                });
            }

            const question = questionResponse.data.data;
            let isCorrect = false;
            let correctAnswers = [];

            if (question.question_type === 'mcq' || question.options) {
                const numberToLetter = (num) => {
                    const number = typeof num === 'string' ? parseInt(num) : num;
                    if (isNaN(number) || number < 0) return num.toString();
                    return String.fromCharCode(65 + number);
                };

                const rawAnswers = Array.isArray(question.answers) ? question.answers : [question.answers];
                correctAnswers = rawAnswers.map(ans => numberToLetter(ans));
                
                const normalizedUserAnswer = userAnswer.trim().toUpperCase();

                isCorrect = correctAnswers.includes(normalizedUserAnswer);
            } 
            else {
                try {
                    const gradeResponse = await axios.post(`https://scio.ly/api/gemini/grade-free-responses`, {
                        freeResponses: [{
                            question: question,
                            correctAnswers: Array.isArray(question.answers) ? question.answers : [question.answers],
                            studentAnswer: userAnswer
                        }]
                    });

                    if (gradeResponse.data.success && gradeResponse.data.data.length > 0) {
                        const result = gradeResponse.data.data[0];
                        isCorrect = result.isCorrect;

                        const rawAnswers = Array.isArray(question.answers) ? question.answers : [question.answers];
                        correctAnswers = rawAnswers.map(ans => {
                            const number = typeof ans === 'string' ? parseInt(ans) : ans;
                            if (!isNaN(number) && number >= 0 && number <= 25) {
                                return String.fromCharCode(65 + number);
                            }
                            return ans.toString();
                        });
                    } else {
                        throw new Error('Failed to grade response');
                    }
                } catch (gradeError) {
                    console.error('Error grading FRQ:', gradeError);
                    return await interaction.editReply({
                        content: 'Grading failed. Please try again in a few moments.',
                        ephemeral: true
                    });
                }
            }

            const embed = new EmbedBuilder()
                .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
                .setTitle(isCorrect ? '**Correct!**' : '**Incorrect**')
                .setDescription(`**Question:** ${question.question}`)
                .addFields(
                    { 
                        name: '**Your Answer:**', 
                        value: userAnswer, 
                        inline: true 
                    },
                    { 
                        name: '**Correct Answer(s):**', 
                        value: Array.isArray(correctAnswers) ? correctAnswers.join(', ') : correctAnswers.toString(), 
                        inline: true 
                    },
                    { 
                        name: '**Question ID:**', 
                        value: questionId, 
                        inline: false 
                    }
                )
                .setFooter({ text: 'Use /explain to check the question!' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in Check command:', error);
            
            if (error.response && error.response.status === 429) {
                await interaction.editReply({
                    content: 'Rate limit exceeded. Please try again in a few moments.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: 'Command failed. Please try again later.',
                    ephemeral: true
                });
            }
        }
    },
};
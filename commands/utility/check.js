const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const API_BASE_URL = 'https://scio.ly/api';

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

            // Fetch the question from the API
            const questionResponse = await axios.get(`${API_BASE_URL}/questions/${questionId}`);
            
            if (!questionResponse.data.success) {
                return await interaction.editReply({
                    content: 'Question not found. Please check the question ID.',
                    ephemeral: true
                });
            }

            const question = questionResponse.data.data;
            let isCorrect = false;
            let correctAnswers = [];

            // Handle MCQ questions
            if (question.question_type === 'mcq' || question.options) {
                // Function to convert numbers to letters (0=A, 1=B, 2=C, etc.)
                const numberToLetter = (num) => {
                    const number = typeof num === 'string' ? parseInt(num) : num;
                    if (isNaN(number) || number < 0) return num.toString();
                    return String.fromCharCode(65 + number); // 65 is 'A', so 65 + 0 = 'A'
                };

                // Extract correct answers and convert numbers to letters
                const rawAnswers = Array.isArray(question.answers) ? question.answers : [question.answers];
                correctAnswers = rawAnswers.map(ans => numberToLetter(ans));
                
                // Normalize user answer to uppercase for comparison
                const normalizedUserAnswer = userAnswer.trim().toUpperCase();

                // Check if user answer matches any correct answer (letter only)
                isCorrect = correctAnswers.includes(normalizedUserAnswer);
            } 
            // Handle FRQ questions
            else {
                try {
                    // Use AI to grade free response
                    const gradeResponse = await axios.post(`${API_BASE_URL}/gemini/grade-free-responses`, {
                        freeResponses: [{
                            question: question,
                            correctAnswers: Array.isArray(question.answers) ? question.answers : [question.answers],
                            studentAnswer: userAnswer
                        }]
                    });

                    if (gradeResponse.data.success && gradeResponse.data.data.length > 0) {
                        const result = gradeResponse.data.data[0];
                        isCorrect = result.isCorrect || result.score >= 0.7;

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
                        content: 'Command failed. Please visit https://tinyurl.com/HylasTheCatDocumentation for help.',
                        ephemeral: true
                    });
                }
            }

            // Create response embed
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
            console.error('Error in check command:', error);
            
            if (error.response && error.response.status === 404) {
                await interaction.editReply({
                    content: 'Question not found. Please check the question ID.',
                    ephemeral: true
                });
            } else if (error.response && error.response.status === 429) {
                await interaction.editReply({
                    content: 'Rate limit exceeded. Please visit https://tinyurl.com/HylasTheCatDocumentation for help.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: 'Command failed. Please visit https://tinyurl.com/HylasTheCatDocumentation for help.',
                    ephemeral: true
                });
            }
        }
    },
};
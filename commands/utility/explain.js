const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
// Axios client configured for scio.ly with API key header
const api = axios.create({
  baseURL: 'https://scio.ly',
  headers: {
    'X-API-Key': process.env.SCIO_API_KEY || 'xo9IKNJG65e0LMBa55Tq',
    'Content-Type': 'application/json'
  },
});
module.exports = {
    data: new SlashCommandBuilder()
        .setName('explain')
        .setDescription('Get an AI-generated explanation for a question')
        .addStringOption(option =>
            option.setName('question_id')
                .setDescription('The ID of the question to explain')
                .setRequired(true)),


    async execute(interaction) {
        try {
            await interaction.deferReply();

            const questionId = interaction.options.getString('question_id');

            const questionResponse = await api.get(`/api/questions/${questionId}`);

            if (!questionResponse.data.success) {
                return await interaction.editReply({
                    content: 'Question not found. Please check the question ID.',
                    ephemeral: true
                });
            }

            const question = questionResponse.data.data;

            try {
                const explainPayload = {
                    question: question,
                    event: question.event
                };

                const explainResponse = await api.get(`/api/gemini/explain`, { params: explainPayload });

                if (!explainResponse.data.success) {
                    throw new Error('Failed to generate explanation');
                }

                const explanation = explainResponse.data.data.explanation || 'No explanation available.';

                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('**Question Explanation**')
                    .setDescription(explanation.length > 4096 ? explanation.substring(0, 4093) + '...' : explanation)
                    .addFields({
                        name: '**Question:**',
                        value: question.question,
                        inline: false
                    })
                    .setFooter({ text: `Question ID: ${questionId}` });

                if (question.question_type === 'mcq' && question.options) {
                    const answerChoices = question.options
                        .map((opt, i) => `**${String.fromCharCode(65 + i)})** ${opt}`)
                        .join('\n');
                    
                    embed.addFields({
                        name: '**Answer Choices:**',
                        value: answerChoices.length > 1024 ? answerChoices.substring(0, 1021) + '...' : answerChoices,
                        inline: false
                    });
                }

                if (question.answers) {
                    const numberToLetter = (num) => {
                        const number = typeof num === 'string' ? parseInt(num) : num;
                        if (isNaN(number) || number < 0 || number > 25) return num.toString();
                        return String.fromCharCode(65 + number);
                    };

                    const rawAnswers = Array.isArray(question.answers) ? question.answers : [question.answers];
                    const correctAnswers = rawAnswers.map(ans => numberToLetter(ans)).join(', ');
                    
                    embed.addFields({
                        name: '**Correct Answer(s):**',
                        value: correctAnswers,
                        inline: true
                    });
                }

                await interaction.editReply({ embeds: [embed] });

            } catch (explainError) {
                console.error('Error getting explanation:', explainError);
                
                if (explainError.response && explainError.response.status === 429) {
                    await interaction.editReply({
                        content: 'Rate limit exceeded. Please try again in a few moments.',
                        ephemeral: true
                    });
                } else {
                    await interaction.editReply({
                        content: 'Explanation failed. Please try again in a few moments.',
                        ephemeral: true
                    });
                }
            }

        } catch (error) {
            console.error('Error in Explain command:', error);
            
            if (error.response && error.response.status === 404) {
                await interaction.editReply({
                    content: 'Question not found. Please check the question ID.',
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
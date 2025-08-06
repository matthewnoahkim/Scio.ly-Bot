// /commands/mcq.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// Static options
const eventOptions = [
  "Anatomy - Endocrine", "Anatomy - Nervous", "Anatomy - Sense Organs",
  "Astronomy", "Chemistry Lab", "Circuit Lab",
  "Designer Genes", "Disease Detectives", "Dynamic Planet - Oceanography",
  "Entomology", "Forensics", "Heredity", "Meteorology",
  "Metric Mastery", "Potions and Poisons", "Rocks and Minerals",
  "Solar System", "Water Quality - Freshwater"
];

const divisionOptions = ["B", "C", "B/C"];
const difficultyMap = {
  "Very Easy (0-19%)": 0.0,
  "Easy (20-39%)": 0.2,
  "Medium (40-59%)": 0.4,
  "Hard (60-79%)": 0.6,
  "Very Hard (80-100%)": 0.8
};

// Subtopics mapping for each event
const eventSubtopics = {
  "Anatomy - Endocrine": ["Hormones", "Glands", "Regulation", "Feedback", "Development"],
  "Anatomy - Nervous": ["Brain", "Spinal Cord", "Nerves", "Reflexes", "Neurotransmitters"],
  "Anatomy - Sense Organs": ["Eyes", "Ears", "Nose", "Tongue", "Skin"],
  "Astronomy": ["Solar System", "Stars", "Galaxies", "Cosmology", "Instruments"],
  "Chemistry Lab": ["Stoichiometry", "Equilibrium", "Periodicity", "Redox Reactions", "Aqueous Solutions", "Acids and Bases", "Physical Properties", "Thermodynamics", "Gas Laws", "Kinetics", "Electrochemistry"],
  "Circuit Lab": ["Circuits", "Sensors", "Calibration", "Design", "Troubleshooting"],
  "Designer Genes": ["Genetics", "DNA", "Proteins", "Evolution", "Population Genetics"],
  "Disease Detectives": ["Epidemiology", "Pathogens", "Prevention", "Outbreak Investigation", "Statistics"],
  "Dynamic Planet - Oceanography": ["Ocean Circulation", "Marine Life", "Chemistry", "Geology", "Climate"],
  "Entomology": ["Insect Anatomy", "Life Cycles", "Behavior", "Classification", "Ecology"],
  "Forensics": ["Evidence Analysis", "Fingerprints", "DNA", "Toxicology", "Crime Scene"],
  "Heredity": ["Genetics", "DNA", "Proteins", "Evolution", "Population Genetics"],
  "Meteorology": ["Weather Systems", "Clouds", "Precipitation", "Temperature", "Pressure"],
  "Metric Mastery": ["Estimation", "Orders of Magnitude", "Problem Solving", "Scientific Reasoning", "Calculations"],
  "Potions and Poisons": ["Toxicology", "Pharmacology", "Dosage", "Symptoms", "Antidotes"],
  "Rocks and Minerals": ["Igneous", "Sedimentary", "Metamorphic", "Mineral Properties", "Crystal Systems"],
  "Solar System": ["Planets", "Moons", "Asteroids", "Comets", "Galaxies"],
  "Water Quality - Freshwater": ["PH", "Dissolved Oxygen", "Nutrients", "Pollutants", "Testing"]
};

// Generate subtopic number options (1-11)
const subtopicNumberOptions = Array.from({ length: 11 }, (_, i) => ({
  name: `Subtopic ${i + 1}`,
  value: (i + 1).toString()
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mcq')
    .setDescription('Sends a multiple choice question for you to solve')
    .addStringOption(option =>
      option.setName('event')
        .setDescription('Event name')
        .setRequired(true)
        .addChoices(...eventOptions.map(e => ({ name: e, value: e }))))
    .addStringOption(option =>
      option.setName('division')
        .setDescription('Division')
        .setRequired(false)
        .addChoices(...divisionOptions.map(d => ({ name: d, value: d }))))
    .addStringOption(option =>
      option.setName('difficulty')
        .setDescription('Difficulty (leave blank for random)')
        .setRequired(false)
        .addChoices(...Object.keys(difficultyMap).map(label => ({ name: label, value: label }))))
    .addStringOption(option =>
      option.setName('subtopic')
        .setDescription('Subtopic number (leave blank for random)')
        .setRequired(false)
        .addChoices(...subtopicNumberOptions)),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const event = interaction.options.getString('event');
      const division = interaction.options.getString('division');
      const difficultyLabel = interaction.options.getString('difficulty');
      const subtopicNumber = interaction.options.getString('subtopic');

      let difficulty_min, difficulty_max;
      if (difficultyLabel) {
        difficulty_min = difficultyMap[difficultyLabel];
        difficulty_max = difficulty_min + 0.19;
      }

      // Map subtopic number to actual subtopic name
      let subtopic = null;
      if (subtopicNumber && eventSubtopics[event]) {
        const subtopicIndex = parseInt(subtopicNumber) - 1;
        if (subtopicIndex >= 0 && subtopicIndex < eventSubtopics[event].length) {
          subtopic = eventSubtopics[event][subtopicIndex];
        }
      }

      const query = {
        event,
        division,
        difficulty_min,
        difficulty_max,
        subtopic,
        question_type: 'mcq',
        limit: 1
      };

      const res = await axios.get('https://scio.ly/api/questions', { params: query });
      const question = res.data.data[0];

      if (!question) {
        await interaction.editReply({
          content: 'Command failed. Please visit https://tinyurl.com/HylasTheCatDocumentation for help.',
          ephemeral: true
        });
        return;
      }

      // Format answer choices
      const answerChoices = question.options
        .map((opt, i) => `**${String.fromCharCode(65 + i)})** ${opt}`)
        .join('\n');

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Multiple Choice Question')
        .setDescription(question.question)
        .addFields(
          {
            name: '**Answer Choices:**',
            value: answerChoices,
            inline: false
          },
          {
            name: '**Event:**',
            value: question.event,
            inline: true
          },
          {
            name: '**Division:**',
            value: question.division || 'N/A',
            inline: true
          },
          {
            name: '**Difficulty:**',
            value: `${Math.round(question.difficulty * 100)}%`,
            inline: true
          },
          {
            name: '**Subtopics:**',
            value: question.subtopics?.join(', ') || 'None',
            inline: false
          },
          {
            name: '**Question ID:**',
            value: question.id.toString(),
            inline: false
          }
        )
        .setFooter({ text: 'Use /check to check your answer!' });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Error in MCQ command:', err);
      
      if (err.response && err.response.status === 429) {
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
  }
};
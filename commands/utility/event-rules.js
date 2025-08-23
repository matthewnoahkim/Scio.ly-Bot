// /event-rules.js

const EVENT_RULES = {
  'Anatomy - Endocrine': {
    divisions: ['C'],
    allowedSubtopics: ['Hormones', 'Glands', 'Regulation', 'Feedback', 'Development'],
    allowImages: true,
  },
  'Anatomy - Nervous': {
    divisions: ['C'],
    allowedSubtopics: ['Brain', 'Spinal Cord', 'Nerves', 'Reflexes', 'Neurotransmitters'],
    allowImages: true,
  },
  'Anatomy - Sense Organs': {
    divisions: ['C'],
    allowedSubtopics: ['Eyes', 'Ears', 'Nose', 'Tongue', 'Skin'],
    allowImages: true,
  },
  Astronomy: {
    divisions: ['C'],
    allowedSubtopics: ['Solar System', 'Stars', 'Galaxies', 'Cosmology', 'Instruments'],
    allowImages: false, // pictured row appears red
  },
  'Chemistry Lab': {
    divisions: ['C'],
    allowedSubtopics: [
      'Stoichiometry', 'Equilibrium', 'Periodicity', 'Redox Reactions', 'Aqueous Solutions',
      'Acids and Bases', 'Physical Properties', 'Thermodynamics', 'Gas Laws', 'Kinetics', 'Electrochemistry'
    ],
    allowImages: false,
  },
  'Circuit Lab': {
    divisions: ['C'],
    allowedSubtopics: ['Circuits', 'Sensors', 'Calibration', 'Design', 'Troubleshooting'],
    allowImages: true,
  },
  'Designer Genes': {
    divisions: ['C'],
    allowedSubtopics: ['Genetics', 'DNA', 'Proteins', 'Evolution', 'Population Genetics'],
    allowImages: true,
  },
  'Disease Detectives': {
    divisions: ['C'],
    allowedSubtopics: ['Epidemiology', 'Pathogens', 'Prevention', 'Outbreak Investigation', 'Statistics'],
    allowImages: true,
  },
  'Dynamic Planet - Oceanography': {
    divisions: ['C'],
    allowedSubtopics: ['Ocean Circulation', 'Marine Life', 'Chemistry', 'Geology', 'Climate'],
    allowImages: true,
  },

  // Lower table (Div B events)
  Entomology: {
    divisions: ['B'],
    allowedSubtopics: ['Insect Anatomy', 'Life Cycles', 'Behavior', 'Classification', 'Ecology'],
    allowImages: true,
  },
  Forensics: {
    divisions: ['B'],
    allowedSubtopics: ['Evidence Analysis', 'Fingerprints', 'DNA', 'Toxicology', 'Crime Scene'],
    allowImages: true,
  },
  Heredity: {
    divisions: ['B'],
    allowedSubtopics: ['Genetics', 'DNA', 'Proteins', 'Evolution', 'Population Genetics'],
    allowImages: false,
  },
  Meteorology: {
    divisions: ['B'],
    allowedSubtopics: ['Weather Systems', 'Clouds', 'Precipitation', 'Temperature', 'Pressure'],
    allowImages: false,
  },
  'Metric Mastery': {
    divisions: ['B'],
    allowedSubtopics: ['Estimation', 'Orders of Magnitude', 'Problem Solving', 'Scientific Reasoning', 'Calculations'],
    allowImages: false,
  },
  'Potions and Poisons': {
    divisions: ['B'],
    allowedSubtopics: ['Toxicology', 'Pharmacology', 'Dosage', 'Symptoms', 'Antidotes'],
    allowImages: true,
  },
  'Remote Sensing': {
    divisions: ['B'],
    allowedSubtopics: ['Satellites', 'Imaging', 'Data Analysis', 'Applications', 'Technology'],
    allowImages: true,
  },
  'Rocks and Minerals': {
    divisions: ['B'],
    allowedSubtopics: ['Igneous', 'Sedimentary', 'Metamorphic', 'Mineral Properties', 'Crystal Systems'],
    allowImages: true,
  },
  'Solar System': {
    divisions: ['B'],
    allowedSubtopics: ['Planets', 'Moons', 'Asteroids', 'Comets', 'Galaxies'],
    allowImages: false,
  },
  'Water Quality - Freshwater': {
    divisions: ['B'],
    allowedSubtopics: ['PH', 'Dissolved Oxygen', 'Nutrients', 'Pollutants', 'Testing'],
    allowImages: true,
  },
};

module.exports = { EVENT_RULES };

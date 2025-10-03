const { createSciOlyCommand } = require('../../shared-command-utils');

// Command configuration
const COMMAND_NAME = 'materialssciencenanomaterials';
const EVENT_NAME = 'Materials Science - Nanomaterials';
const DIVISIONS = ['C'];
const ALLOWED_SUBTOPICS = ['Types of Nanomaterials','Structure & Chemistry','Applications of Nanomaterials','Optical Properties','Electrical Properties','Thermal Properties','Mechanical Properties','Magnetic Properties','Surfaces & Interfaces','Diffusion & Crystal Defects','Diffraction & Scattering','Bottom-Up Synthesis','Top-Down Synthesis','Chemistry','Characterization','Theory','Spectroscop Techniques','Crystal Defects','Microscopy Techniques','UV-Vis Spectroscopy','Photoluminescence','Raman Spectroscopy','EDS','Mass Spectrometry','Physical Properties','Characterization Techniques','Modeling','Calculations','Experimental Methods','Size Effects on Mechanical Properties','Plasticity & Dislocations','Adhesion & Interfaces','Hardness & Wear','Advanced Topics','Fracture & Toughness','Fatigue & Cyclic Loading','Extreme Environments','Scattering','Absorption','Plasmons','Quantum Confinement','Color','Luminescence & Fluorescence','Reflection & Refraction','Transmission','Physics of Materials','Nanomaterials','Interfaces','Techniques'];
const ALLOW_IMAGES = false;

module.exports = createSciOlyCommand({
  commandName: COMMAND_NAME,
  eventName: EVENT_NAME,
  divisions: DIVISIONS,
  allowedSubtopics: ALLOWED_SUBTOPICS,
  allowImages: ALLOW_IMAGES
});
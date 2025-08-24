const axios = require('axios');

// ===== ID Question Configuration =====
const ID_EVENT_CONFIGS = {
  'Anatomy - Nervous': { divisions: ['B/C'], idDivision: 'B/C' },
  'Anatomy - Endocrine': { divisions: ['B/C'], idDivision: 'B/C' },
  'Anatomy - Sense Organs': { divisions: ['B/C'], idDivision: 'B/C' },
  'Entomology': { divisions: ['B/C'], idDivision: 'B/C' },
  'Circuit Lab': { divisions: ['B/C'], idDivision: 'B/C' },
  'Rocks and Minerals': { divisions: ['B/C'], idDivision: 'B/C' },
  'Water Quality - Freshwater': { divisions: ['B/C'], idDivision: 'B/C' },
  'Remote Sensing': { divisions: ['B/C'], idDivision: 'B/C' },
  'Dynamic Planet - Oceanography': { divisions: ['B/C'], idDivision: 'B/C' }
};

// ===== Helper Functions =====
function getDivisions(eventName) {
  const config = ID_EVENT_CONFIGS[eventName];
  return config ? config.divisions : ['B', 'C'];
}

function buildQuestionTypeChoices(allowImages) {
  const choices = [
    { name: 'Multiple Choice', value: 'MCQ' },
    { name: 'Free Response', value: 'FRQ' }
  ];
  
  if (allowImages) {
    choices.push({ name: 'Identification (ID)', value: 'ID' });
  }
  
  return choices;
}

async function handleIDQuestionLogic(eventName, questionType, division, subtopic, minDifficulty, maxDifficulty, authHeaders) {
  // If question type is ID, use ID API
  if (questionType === 'ID') {
    try {
      const config = ID_EVENT_CONFIGS[eventName];
      if (!config) {
        throw new Error(`Event '${eventName}' does not support ID questions.`);
      }

      // For ID questions, always use the ID division
      const idDivision = config.idDivision;
      
      // Build API parameters
      const params = {
        event: eventName,
        division: idDivision,
        limit: 1
      };

      // Add subtopic if specified
      if (subtopic) {
        params.subtopic = subtopic;
      }

      // Add difficulty filters if specified
      if (minDifficulty !== undefined) {
        params.difficulty_min = minDifficulty;
      }
      if (maxDifficulty !== undefined) {
        params.difficulty_max = maxDifficulty;
      }

      console.log(`[DEBUG] ID API call params:`, params);

      // Fetch ID question
      const response = await axios.get('https://scio.ly/api/id-questions', {
        params,
        timeout: 15000,
        headers: authHeaders
      });

      console.log(`[DEBUG] ID API response:`, response.data);

      if (!response.data?.success || !response.data.data?.length) {
        // If no results with subtopic, try without subtopic
        if (subtopic) {
          console.log(`[DEBUG] No ID questions found with subtopic '${subtopic}', trying without subtopic...`);
          delete params.subtopic;
          
          const fallbackResponse = await axios.get('https://scio.ly/api/id-questions', {
            params,
            timeout: 15000,
            headers: authHeaders
          });

          if (fallbackResponse.data?.success && fallbackResponse.data.data?.length) {
            return {
              question: fallbackResponse.data.data[0],
              isID: true
            };
          }
        }
        
        throw new Error('No identification questions found for your filters. Try different filters.');
      }

      return {
        question: response.data.data[0],
        isID: true
      };

    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('No identification questions found for your filters. Try different filters.');
      }
      throw error;
    }
  }

  // For non-ID questions, return null to indicate regular question path
  return {
    question: null,
    isID: false
  };
}

module.exports = {
  getDivisions,
  buildQuestionTypeChoices,
  handleIDQuestionLogic
};

const axios = require('axios');

// ====== Config ======
const PRIMARY_BASE = 'https://scio.ly';
const FALLBACK_BASE = 'https://scioly-api.vercel.app';

// ===== Shared Helper Functions =====
function letterFromIndex(idx) {
  return String.fromCharCode(65 + idx);
}

function buildFullQuestionText(question) {
  let fullText = question.question || '';
  
  // Check if the question text is too short or incomplete
  if (fullText.length < 10) {
    // Try to build a more complete question from available data
    let reconstructedQuestion = '';
    
    if (question.subtopics && question.subtopics.length > 0) {
      reconstructedQuestion += `This is a ${question.event || 'Science Olympiad'} question about ${question.subtopics.join(', ')}.`;
    }
    
    if (fullText.trim()) {
      reconstructedQuestion += ` ${fullText.trim()}`;
    }
    
    if (question.answers && question.answers.length > 0) {
      reconstructedQuestion += ` The expected answer is: ${question.answers.join(', ')}`;
    }
    
    if (reconstructedQuestion) {
      fullText = reconstructedQuestion;
    } else {
      fullText = `This is a ${question.event || 'Science Olympiad'} question that needs explanation.`;
    }
  }
  
  // If it's an MCQ question, append the options
  if (Array.isArray(question.options) && question.options.length > 0) {
    const answerChoices = question.options
      .map((opt, i) => `\n${letterFromIndex(i)}) ${opt}`)
      .join('');
    fullText += '\n\nAnswer Choices:' + answerChoices;
  } else {
    // For FRQ questions, add context to make it clear this is a complete question
    if (!fullText.toLowerCase().includes('question')) {
      fullText = `Question: ${fullText}`;
    }
    
    // Add additional context if available
    if (question.answers && Array.isArray(question.answers) && question.answers.length > 0) {
      fullText += `\n\nNote: This is a free response question. Expected answer(s): ${question.answers.join(', ')}`;
    } else {
      fullText += `\n\nNote: This is a free response question requiring a detailed explanation.`;
    }
  }
  
  return fullText;
}

function buildTutorPrompt(questionText, eventName) {
  const isMCQ = questionText.includes('Answer Choices:');
  
  let prompt = `You are an expert Science Olympiad tutor specializing in ${eventName}. Your task is to provide a clear, educational explanation for the following question.

${questionText}

Instructions:
- Provide a concise but complete step-by-step explanation (aim for 200-400 words)
- If this is a multiple choice question, analyze each answer choice and explain why the correct answer is right and why the others are wrong
- If this is a free response question, provide a comprehensive explanation that covers all key concepts and expected points
- Use clear scientific terminology and explain any complex concepts
- Format your response to be educational and engaging for high school students
- Focus on teaching the underlying science, not just giving the answer
- Keep your response concise to avoid truncation in Discord

Please provide your explanation:`

  return prompt;
}

async function callGeminiThroughScioLy(question, eventName, userAnswer, authHeaders, logPrefix = 'shared') {
  // Build the request body matching the curl example format
  // Important: We need to format the question text properly before sending
  const formattedQuestion = {
    ...question,
    // Override the question text with properly formatted version that includes A, B, C, D labels
    question: buildFullQuestionText(question)
  };
  
  const requestBody = {
    question: formattedQuestion,
    event: eventName,
    userAnswer: userAnswer || null
  };
  
  try {
    const response = await axios.post(`${PRIMARY_BASE}/api/gemini/explain`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      timeout: 30000
    });
    
    // Extract the response text
    const responseText = extractExplanation(response.data);
    if (!responseText) {
      throw new Error('No explanation text found in scio.ly response');
    }
    
    return responseText;
    
  } catch (error) {
    console.error(`[${logPrefix}] scio.ly API error:`, error.response?.status, error.response?.data?.message || error.message);
    throw error;
  }
}

function extractExplanation(responseData) {
  // For scio.ly API, check success first then extract explanation
  if (responseData?.success && responseData?.data?.explanation) {
    return responseData.data.explanation;
  }
  
  // Try different possible response formats for fallback APIs
  if (responseData?.data) {
    if (typeof responseData.data === 'string') {
      return responseData.data;
    } else if (responseData.data.explanation) {
      return responseData.data.explanation;
    } else if (responseData.data.text) {
      return responseData.data.text;
    }
  } else if (typeof responseData === 'string') {
    return responseData;
  } else if (responseData?.explanation) {
    return responseData.explanation;
  } else if (responseData?.text) {
    return responseData.text;
  } else if (responseData?.message) {
    return responseData.message;
  } else if (responseData?.content) {
    return responseData.content;
  } else if (responseData?.response) {
    return responseData.response;
  } else if (responseData?.result) {
    return responseData.result;
  }
  return null;
}

async function getExplanationWithRetry(question, eventName, authHeaders, logPrefix = 'shared') {
  // Build the question text once to ensure consistency  
  const fullQuestionText = buildFullQuestionText(question);
  
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount <= maxRetries) {
    try {
      // Use the new scio.ly explain format matching the curl example
      const explanation = await callGeminiThroughScioLy(question, eventName, null, authHeaders, logPrefix);
      
      // Validate the explanation
      if (explanation && 
          !explanation.includes('I apologize, but you have not provided a question') &&
          !explanation.includes('question itself was not provided') &&
          !explanation.includes('Please provide the') &&
          explanation.length > 50) {
        
        // Use more lenient keyword matching - only check against the actual question text, not the formatted version
        const actualQuestionText = question.question || '';
        const questionKeywords = actualQuestionText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        const explanationLower = explanation.toLowerCase();
        const matchingKeywords = questionKeywords.filter(keyword => explanationLower.includes(keyword));
        
        // Very lenient threshold - only reject if less than 5% keyword match
        const keywordMatchPercentage = questionKeywords.length > 0 ? (matchingKeywords.length / questionKeywords.length) : 1;
        if (questionKeywords.length > 0 && keywordMatchPercentage < 0.05 && actualQuestionText.length > 20) {
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
            retryCount++;
            continue;
          }
        }
        
        return explanation;
        
      } else if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500 * (retryCount + 1)));
        retryCount++;
        continue;
      }
      
      break;
    } catch (primaryErr) {
      if (retryCount < maxRetries) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        continue;
      }
      
      // If all retries failed, try fallback API with legacy format
      try {
        const tutorPrompt = buildTutorPrompt(fullQuestionText, eventName);
        const fallbackRes = await axios.post(`${FALLBACK_BASE}/api/gemini/explain`, {
          question: tutorPrompt,
          event: eventName,
          streaming: false
        }, { headers: authHeaders });
        
        const explanation = extractExplanation(fallbackRes.data) || 'No explanation was returned.';
        return explanation;
      } catch (fallbackErr) {
        console.error(`[${logPrefix}] All explanation APIs failed:`, fallbackErr?.response?.status, fallbackErr?.message);
        throw fallbackErr;
      }
    }
  }
  
  return 'The API returned an error message. This might be due to rate limiting or temporary issues. Please try again in a moment.';
}

module.exports = {
  letterFromIndex,
  buildFullQuestionText,
  buildTutorPrompt,
  extractExplanation,
  getExplanationWithRetry,
  callGeminiThroughScioLy
}; 
const axios = require('axios');
const keyManager = require('./key-manager');

// ====== Config ======
const PRIMARY_BASE = 'https://scio.ly';
const FALLBACK_BASE = 'https://scioly-api.vercel.app';
const USE_DIRECT_GEMINI = keyManager.getKeyCount() > 0; // Use direct Gemini if any API key is available

// ===== Shared Helper Functions =====
function letterFromIndex(idx) {
  return String.fromCharCode(65 + idx);
}

function buildFullQuestionText(question) {
  let fullText = question.question || '';
  
  // If it's an MCQ question, append the options
  if (Array.isArray(question.options) && question.options.length > 0) {
    const answerChoices = question.options
      .map((opt, i) => `\n${letterFromIndex(i)}) ${opt}`)
      .join('');
    fullText += '\n\nAnswer Choices:' + answerChoices;
  } else {
    // For FRQ questions, add context to make it clear this is a complete question
    fullText = `Question: ${fullText}`;
    
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
- Provide a step-by-step explanation that helps students understand the concepts
- If this is a multiple choice question, analyze each answer choice and explain why the correct answer is right and why the others are wrong
- If this is a free response question, provide a comprehensive explanation that covers all key concepts and expected points
- Use clear scientific terminology and explain any complex concepts
- Format your response to be educational and engaging for high school students
- Focus on teaching the underlying science, not just giving the answer

Please provide your explanation:`

  return prompt;
}

async function callGeminiDirectly(prompt, logPrefix = 'shared') {
  if (keyManager.getKeyCount() === 0) {
    throw new Error('No Gemini API keys available. Please add GEMINI_API_KEY to your environment variables.');
  }
  
  console.log(`[${logPrefix}] Calling Gemini directly...`);
  console.log(`[${logPrefix}] Prompt length:`, prompt.length, 'characters');
  
  // Try with multiple keys if available
  const maxRetries = keyManager.hasMultipleKeys() ? keyManager.getKeyCount() : 1;
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const keyInfo = keyManager.getNextKey();
      console.log(`[${logPrefix}] Attempt ${attempt + 1}/${maxRetries} with key ${keyInfo.keyNumber}/${keyInfo.totalKeys}`);
      
      const response = await axios.post('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent', {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.8,
          topK: 40
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          key: keyInfo.key
        }
      });
      
      console.log(`[${logPrefix}] Direct Gemini call successful with key ${keyInfo.keyNumber}`);
      keyManager.reportResult(keyInfo.keyIndex, true);
      
      // Extract the response text from Gemini's format
      const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('No response text found in Gemini response');
      }
      
      console.log(`[${logPrefix}] Gemini response length:`, responseText.length);
      return responseText;
      
    } catch (error) {
      lastError = error;
      console.log(`[${logPrefix}] Direct Gemini call failed with key ${attempt + 1}:`, error.response?.data || error.message);
      
      // Report failure to key manager
      if (keyManager.hasMultipleKeys()) {
        const keyInfo = keyManager.getNextKey(); // This will rotate to next key
        keyManager.reportResult(keyInfo.keyIndex, false);
      }
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw lastError;
      }
      
      // Wait a bit before trying the next key
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

function extractExplanation(responseData) {
  // Try different possible response formats
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
  const tutorPrompt = buildTutorPrompt(fullQuestionText, eventName);
  

  
  // Try direct Gemini first if API key is available
  if (USE_DIRECT_GEMINI) {
    console.log(`[${logPrefix}] Using direct Gemini API`);
    try {
      const explanation = await callGeminiDirectly(tutorPrompt, logPrefix);
      
      // Validate the explanation
      if (explanation && explanation.length > 50) {
        // Check if the explanation actually relates to our question
        const questionKeywords = fullQuestionText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        const explanationLower = explanation.toLowerCase();
        const matchingKeywords = questionKeywords.filter(keyword => explanationLower.includes(keyword));
        
        if (matchingKeywords.length / questionKeywords.length >= 0.3) {
          return explanation;
        } else {
          console.log(`[${logPrefix}] Direct Gemini explanation is unrelated, falling back to scio.ly`);
        }
      }
    } catch (error) {
      console.log(`[${logPrefix}] Direct Gemini failed, falling back to scio.ly:`, error.message);
    }
  }
  
  // Fallback to scio.ly API
  console.log(`[${logPrefix}] Using scio.ly API fallback`);
  let explainRes;
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount <= maxRetries) {
    try {
      console.log(`[${logPrefix}] scio.ly API attempt ${retryCount + 1}/${maxRetries + 1}`);
      
      const requestBody = {
        question: tutorPrompt,
        event: eventName,
        streaming: false,
        questionId: question.id || null
      };
      
      console.log(`[${logPrefix}] scio.ly API request body keys:`, Object.keys(requestBody));
      console.log(`[${logPrefix}] Question length being sent:`, requestBody.question.length);
      
      explainRes = await axios.post(`${PRIMARY_BASE}/api/gemini/explain`, requestBody, { headers: authHeaders });
      console.log(`[${logPrefix}] scio.ly explanation API success on attempt ${retryCount + 1}`);
      
      // Check if we got a valid explanation (not an error message)
      const tempExplanation = extractExplanation(explainRes.data);
      console.log(`[${logPrefix}] Temp explanation preview:`, tempExplanation ? tempExplanation.substring(0, 100) + '...' : 'null');
      console.log(`[${logPrefix}] Full API response data:`, JSON.stringify(explainRes.data, null, 2));
      
      if (tempExplanation && 
          !tempExplanation.includes('I apologize, but you have not provided a question') &&
          !tempExplanation.includes('question itself was not provided') &&
          !tempExplanation.includes('Please provide the') &&
          tempExplanation.length > 50) {
        
        // Check if the explanation actually relates to our question
        const questionKeywords = fullQuestionText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        const explanationLower = tempExplanation.toLowerCase();
        const matchingKeywords = questionKeywords.filter(keyword => explanationLower.includes(keyword));
        
        console.log(`[${logPrefix}] Question keywords:`, questionKeywords.slice(0, 10));
        console.log(`[${logPrefix}] Matching keywords in explanation:`, matchingKeywords);
        console.log(`[${logPrefix}] Keyword match percentage: ${(matchingKeywords.length / questionKeywords.length * 100).toFixed(1)}%`);
        
        if (matchingKeywords.length / questionKeywords.length < 0.3) {
          console.log(`[${logPrefix}] ERROR: Explanation is completely unrelated to the question! Only ${(matchingKeywords.length / questionKeywords.length * 100).toFixed(1)}% keyword match.`);
          if (retryCount < maxRetries) {
            console.log(`[${logPrefix}] Will retry due to completely wrong explanation...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
            retryCount++;
            continue;
          } else {
            console.log(`[${logPrefix}] All retries exhausted, returning error message`);
            return 'The API returned an explanation for a different question. This appears to be an API issue. Please try again in a moment.';
          }
        }
        
        console.log(`[${logPrefix}] Valid explanation received, breaking retry loop`);
        break;
      } else if (retryCount < maxRetries) {
        console.log(`[${logPrefix}] Received error message or insufficient response, will retry...`);
        await new Promise(resolve => setTimeout(resolve, 1500 * (retryCount + 1)));
        retryCount++;
        continue;
      }
      
      break;
    } catch (primaryErr) {
      console.log(`[${logPrefix}] scio.ly API attempt ${retryCount + 1} failed:`, primaryErr?.response?.status, primaryErr?.response?.data);
      if (retryCount < maxRetries) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        continue;
      }
      
      // If all retries failed, try fallback API
      console.log(`[${logPrefix}] All scio.ly API retries failed, trying fallback...`);
      try {
        explainRes = await axios.post(`${FALLBACK_BASE}/api/gemini/explain`, {
          question: tutorPrompt,
          event: eventName,
          streaming: false
        }, { headers: authHeaders });
        console.log(`[${logPrefix}] Fallback explanation API success`);
      } catch (fallbackErr) {
        console.log(`[${logPrefix}] Fallback explanation API also failed:`, fallbackErr?.response?.status, fallbackErr?.response?.data);
        throw fallbackErr;
      }
      break;
    }
  }
  
  // Extract explanation using helper function
  const explanation = extractExplanation(explainRes.data) || 'No explanation was returned.';
  console.log(`[${logPrefix}] Extracted explanation length:`, explanation.length);
  
  // Check if the explanation is actually an error message
  if (explanation && (
      explanation.includes('I apologize, but you have not provided a question') ||
      explanation.includes('question itself was not provided') ||
      explanation.includes('Please provide the') ||
      explanation.length < 50)) {
    console.log(`[${logPrefix}] API returned error message or insufficient response instead of explanation`);
    return 'The API returned an error message. This might be due to rate limiting or temporary issues. Please try again in a moment.';
  }
  
  return explanation;
}

module.exports = {
  letterFromIndex,
  buildFullQuestionText,
  buildTutorPrompt,
  extractExplanation,
  getExplanationWithRetry,
  callGeminiDirectly
}; 
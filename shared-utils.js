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
  let explainRes;
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount <= maxRetries) {
    try {
      if (retryCount === 0) {
        console.log(`[${logPrefix}] Trying primary explanation API...`);
        const fullQuestionText = buildFullQuestionText(question);
        console.log(`[${logPrefix}] Full question text being sent:`, fullQuestionText);
        console.log(`[${logPrefix}] Question ID: ${question.id || 'no-id'}`);
        const requestBody = {
          question: fullQuestionText,
          event: eventName,
          streaming: false,
          questionId: question.id || null
        };
        console.log(`[${logPrefix}] API request body:`, JSON.stringify(requestBody, null, 2));
        explainRes = await axios.post(`${PRIMARY_BASE}/api/gemini/explain`, requestBody, { headers: authHeaders });
        console.log(`[${logPrefix}] Primary explanation API success`);
      } else {
        console.log(`[${logPrefix}] Retry ${retryCount} with primary API...`);
        const fullQuestionText = buildFullQuestionText(question);
        console.log(`[${logPrefix}] Retry ${retryCount} - Same question text being sent:`, fullQuestionText);
        console.log(`[${logPrefix}] Retry ${retryCount} - Question ID: ${question.id || 'no-id'}`);
        const requestBody = {
          question: fullQuestionText,
          event: eventName,
          streaming: false,
          questionId: question.id || null
        };
        console.log(`[${logPrefix}] Retry ${retryCount} - API request body:`, JSON.stringify(requestBody, null, 2));
        explainRes = await axios.post(`${PRIMARY_BASE}/api/gemini/explain`, requestBody, { headers: authHeaders });
        console.log(`[${logPrefix}] Primary API retry ${retryCount} success`);
      }
      
      // Check if we got a valid explanation (not an error message)
      const tempExplanation = extractExplanation(explainRes.data);
      console.log(`[${logPrefix}] Temp explanation preview:`, tempExplanation ? tempExplanation.substring(0, 100) + '...' : 'null');
      console.log(`[${logPrefix}] Full API response data:`, JSON.stringify(explainRes.data, null, 2));
      
      if (tempExplanation && 
          !tempExplanation.includes('I apologize, but you have not provided a question') &&
          !tempExplanation.includes('question itself was not provided') &&
          !tempExplanation.includes('Please provide the') &&
          tempExplanation.length > 50) { // Ensure it's a substantial response
        
        // Check if the explanation actually relates to our question
        const questionKeywords = fullQuestionText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        const explanationLower = tempExplanation.toLowerCase();
        const matchingKeywords = questionKeywords.filter(keyword => explanationLower.includes(keyword));
        
        console.log(`[${logPrefix}] Question keywords:`, questionKeywords.slice(0, 10));
        console.log(`[${logPrefix}] Matching keywords in explanation:`, matchingKeywords);
        console.log(`[${logPrefix}] Keyword match percentage: ${(matchingKeywords.length / questionKeywords.length * 100).toFixed(1)}%`);
        
        // If less than 30% of keywords match, this is definitely the wrong explanation
        if (matchingKeywords.length / questionKeywords.length < 0.3) {
          console.log(`[${logPrefix}] ERROR: Explanation is completely unrelated to the question! Only ${(matchingKeywords.length / questionKeywords.length * 100).toFixed(1)}% keyword match.`);
          console.log(`[${logPrefix}] Question was about: "${fullQuestionText.substring(0, 100)}..."`);
          console.log(`[${logPrefix}] But explanation is about: "${tempExplanation.substring(0, 100)}..."`);
          if (retryCount < maxRetries) {
            console.log(`[${logPrefix}] Will retry due to completely wrong explanation...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1))); // Longer delay
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
        await new Promise(resolve => setTimeout(resolve, 1500 * (retryCount + 1))); // Longer exponential backoff
        retryCount++;
        continue;
      }
      
      break;
    } catch (primaryErr) {
      console.log(`[${logPrefix}] Primary explanation API attempt ${retryCount} failed:`, primaryErr?.response?.status, primaryErr?.response?.data);
      if (retryCount < maxRetries) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        continue;
      }
      
      // If all retries failed, try fallback API
      console.log(`[${logPrefix}] All primary API retries failed, trying fallback...`);
      try {
        const fullQuestionText = buildFullQuestionText(question);
        explainRes = await axios.post(`${FALLBACK_BASE}/api/gemini/explain`, {
          question: fullQuestionText,
          event: eventName,
          streaming: false
        }, { headers: authHeaders });
        console.log(`[${logPrefix}] Fallback explanation API success`);
      } catch (fallbackErr) {
        console.log(`[${logPrefix}] Fallback explanation API also failed:`, fallbackErr?.response?.status, fallbackErr?.response?.data);
        throw fallbackErr; // Re-throw to be caught by outer catch
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
  extractExplanation,
  getExplanationWithRetry
}; 
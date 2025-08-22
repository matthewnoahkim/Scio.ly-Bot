require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.SCIO_API_KEY;
const PRIMARY_BASE = 'https://scio.ly';
const FALLBACK_BASE = 'https://scioly-api.vercel.app';

if (!API_KEY) {
  console.error('No SCIO_API_KEY found in environment variables');
  console.log('Please create a .env file with your API key');
  process.exit(1);
}

const AUTH_HEADERS = { 'X-API-Key': API_KEY, Authorization: `Bearer ${API_KEY}` };

async function testAPI() {
  console.log('Testing API with key:', API_KEY.substring(0, 8) + '...');
  console.log('');

  // Test 1: Fetch questions
  console.log('Testing /api/questions endpoint...');
  try {
    const questionsRes = await axios.get(`${PRIMARY_BASE}/api/questions`, {
      params: {
        event: 'Anatomy - Endocrine',
        limit: 1,
        question_type: 'frq'
      },
      headers: AUTH_HEADERS
    });
    
    console.log('Questions API success');
    console.log('Response structure:', Object.keys(questionsRes.data));
    if (questionsRes.data.data && questionsRes.data.data.length > 0) {
      const question = questionsRes.data.data[0];
      console.log('Question sample:', {
        id: question.id,
        hasQuestion: !!question.question,
        hasOptions: Array.isArray(question.options) && question.options.length > 0,
        hasAnswers: Array.isArray(question.answers) && question.answers.length > 0,
        questionType: Array.isArray(question.options) && question.options.length > 0 ? 'MCQ' : 'FRQ'
      });
    }
  } catch (err) {
    console.log('Questions API failed:', err.response?.status, err.response?.data?.message || err.message);
  }
  console.log('');

  // Test 2: Test FRQ grading
  console.log('Testing /api/gemini/grade-free-responses endpoint...');
  try {
    const gradeRes = await axios.post(`${PRIMARY_BASE}/api/gemini/grade-free-responses`, {
      responses: [{
        question: "What is the primary function of insulin?",
        correctAnswers: ["Regulate blood glucose levels", "Lower blood sugar"],
        studentAnswer: "Insulin helps control blood sugar levels"
      }]
    }, { headers: AUTH_HEADERS });
    
    console.log('Grading API success');
    console.log('Response structure:', Object.keys(gradeRes.data));
    console.log('Data keys:', Object.keys(gradeRes.data.data || {}));
    if (gradeRes.data.data && gradeRes.data.data.grades) {
      console.log('Grade sample:', gradeRes.data.data.grades[0]);
    } else if (gradeRes.data.data && gradeRes.data.data.scores) {
      console.log('Score sample:', gradeRes.data.data.scores[0]);
      console.log('Full response data:', JSON.stringify(gradeRes.data.data, null, 2));
    }
  } catch (err) {
    console.log('Grading API failed:', err.response?.status, err.response?.data?.message || err.message);
    
    // Try fallback
    console.log('Trying fallback API...');
    try {
      const fallbackRes = await axios.post(`${FALLBACK_BASE}/api/gemini/grade-free-responses`, {
        responses: [{
          question: "What is the primary function of insulin?",
          correctAnswers: ["Regulate blood glucose levels", "Lower blood sugar"],
          studentAnswer: "Insulin helps control blood sugar levels"
        }]
      }, { headers: AUTH_HEADERS });
      
      console.log('Fallback grading API success');
      console.log('Response structure:', Object.keys(fallbackRes.data));
    } catch (fallbackErr) {
      console.log('Fallback grading API also failed:', fallbackErr.response?.status, fallbackErr.response?.data?.message || fallbackErr.message);
    }
  }
  console.log('');

  // Test 3: Test explanation service
  console.log('Testing /api/gemini/explain endpoint...');
  try {
    const explainRes = await axios.post(`${PRIMARY_BASE}/api/gemini/explain`, {
      question: "What is the primary function of insulin?",
      event: "Anatomy - Endocrine",
      streaming: false
    }, { headers: AUTH_HEADERS });
    
    console.log('Explanation API success');
    console.log('Response structure:', Object.keys(explainRes.data));
    console.log('Data type:', typeof explainRes.data.data);
    if (explainRes.data.data) {
      if (typeof explainRes.data.data === 'string') {
        console.log('Explanation sample:', explainRes.data.data.substring(0, 100) + '...');
      } else if (explainRes.data.data.explanation) {
        console.log('Explanation sample:', explainRes.data.data.explanation.substring(0, 100) + '...');
      } else if (explainRes.data.data.text) {
        console.log('Explanation sample:', explainRes.data.data.text.substring(0, 100) + '...');
      } else {
        console.log('Full explanation data:', JSON.stringify(explainRes.data.data, null, 2));
      }
    }
  } catch (err) {
    console.log('Explanation API failed:', err.response?.status, err.response?.data?.message || err.message);
    
    // Try fallback
    console.log('Trying fallback API...');
    try {
      const fallbackRes = await axios.post(`${FALLBACK_BASE}/api/gemini/explain`, {
        question: "What is the primary function of insulin?",
        event: "Anatomy - Endocrine",
        streaming: false
      }, { headers: AUTH_HEADERS });
      
      console.log('Fallback explanation API success');
      console.log('Response structure:', Object.keys(fallbackRes.data));
    } catch (fallbackErr) {
      console.log('Fallback explanation API also failed:', fallbackErr.response?.status, fallbackErr.response?.data?.message || fallbackErr.message);
    }
  }
}

testAPI().catch(console.error); 
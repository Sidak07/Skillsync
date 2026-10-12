// Groq API Integration for AI Feedback

require('dotenv').config({ path: '../config/.env' });

const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/**
 * Generate AI feedback based on student test scores
 * @param {Object} scores
 * @returns {Promise<string>}
 */
async function generateFeedback(scores) {
  try {
    const prompt = `
Student Assessment Results:
- Aptitude Score: ${scores.aptitude}/100
- Technical Score: ${scores.technical}/100
- Communication Score: ${scores.communication}/100

Provide:
1. Overall performance summary
2. Strengths
3. Areas for improvement
4. Practical suggestions

Keep the response concise, encouraging, and professional.
`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an expert career counselor providing constructive feedback based on assessment scores."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return completion.choices[0]?.message?.content ||
      "Feedback could not be generated.";
  } catch (error) {
    console.error("Error generating AI feedback:", error);
    return "Unable to generate feedback at this time.";
  }
}

/**
 * Generate skill-specific improvement tips
 * @param {string} skill
 * @param {number} score
 * @returns {Promise<string>}
 */
async function generateSkillTips(skill, score) {
  try {
    const prompt = `
A student scored ${score}/100 in ${skill}.

Provide:
- 3 practical improvement tips
- Resources or learning suggestions
- Interview preparation advice if relevant

Keep it concise.
`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an expert mentor helping students improve their skills."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    return completion.choices[0]?.message?.content ||
      "Keep practicing and improving consistently.";
  } catch (error) {
    console.error("Error generating skill tips:", error);
    return "Keep practicing regularly and seek mentor feedback.";
  }
}

module.exports = {
  generateFeedback,
  generateSkillTips
};

// Test Example
/*
(async () => {
  const scores = {
    aptitude: 78,
    technical: 72,
    communication: 85
  };

  const feedback = await generateFeedback(scores);
  console.log("\n=== AI FEEDBACK ===\n");
  console.log(feedback);

  const tips = await generateSkillTips("technical", 72);
  console.log("\n=== SKILL TIPS ===\n");
  console.log(tips);
})();
*/
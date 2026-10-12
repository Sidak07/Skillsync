require("dotenv").config({ path: "../.env" });

const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/**
 * Generate a list of multiple-choice questions using Groq
 * @param {string} type - aptitude | technical | communication | all
 * @param {number} count - number of questions
 * @returns {Promise<Array>}
 */
async function generateQuestions(type = "all", count = 10) {
  const section = ["aptitude", "technical", "communication"].includes(type)
    ? type
    : "all";

  const desired = Number(count) || (section === "all" ? 15 : 10);

  const systemPrompt = `
You are an exam question generator.

Generate EXACTLY ${desired} multiple-choice questions.

Return ONLY valid JSON array.

Each object must have:

{
  "section": "aptitude|technical|communication",
  "question": "Question text",
  "options": ["A","B","C","D"],
  "correct": 0
}

Rules:
- Exactly 4 options.
- correct must be index 0-3.
- No markdown.
- No explanations.
- JSON only.
`;

  const userPrompt = `
Generate ${desired} ${
    section === "all"
      ? "mixed aptitude, technical and communication"
      : section
  } assessment questions.

Difficulty: Intermediate.

Return JSON only.
`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: {
        type: "json_object",
      },
    });

    let content = completion.choices[0]?.message?.content || "";

    // Remove accidental markdown if returned
    content = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(content);

      // Handle wrapper object
      if (parsed.questions) {
        parsed = parsed.questions;
      }
    } catch {
      const start = content.indexOf("[");
      const end = content.lastIndexOf("]");

      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(content.substring(start, end + 1));
      } else {
        throw new Error("Invalid JSON returned by model");
      }
    }

    const questions = parsed.slice(0, desired).map((item, idx) => {
      const q = {
        section:
          item.section ||
          (section === "all"
            ? ["aptitude", "technical", "communication"][idx % 3]
            : section),

        question: String(item.question || "").trim(),

        options: Array.isArray(item.options)
          ? item.options.slice(0, 4).map(String)
          : [],

        correct:
          typeof item.correct === "number"
            ? item.correct
            : 0,
      };

      while (q.options.length < 4) {
        q.options.push("Option");
      }

      q.correct = Math.max(
        0,
        Math.min(3, Number(q.correct) || 0)
      );

      return q;
    });

    return questions;
  } catch (error) {
    console.error("generateQuestions error:", error);

    return [
      {
        section: "aptitude",
        question: "What is 25% of 200?",
        options: ["25", "50", "75", "100"],
        correct: 1,
      },
    ];
  }
}

module.exports = {
  generateQuestions,
};
require("dotenv").config({ path: "../.env" });

console.log("KEY FOUND:", !!process.env.GROQ_API_KEY);
console.log("MODEL:", process.env.GROQ_MODEL);

const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function test() {
  try {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [
        {
          role: "user",
          content: "Say Hello"
        }
      ]
    });

    console.log("\nAI Response:");
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error(error);
  }
}

test();


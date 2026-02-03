import { runAIEngine } from "../../ai/api/ai-engine.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // 🔑 unwrap payload from UI (intake / check-in)
    const userInput = body.payload || body;

    const result = runAIEngine(userInput);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error("AI NETLIFY ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        state: "error",
        message: "Unable to generate your plan right now."
      })
    };
  }
}

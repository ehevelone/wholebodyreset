import { runAIEngine } from "../../ai/api/ai-engine.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  try {
    const userInput = JSON.parse(event.body || "{}");

    // Run AI engine
    const result = runAIEngine(userInput);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error("AI EVALUATE ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "AI evaluation failed"
      })
    };
  }
}

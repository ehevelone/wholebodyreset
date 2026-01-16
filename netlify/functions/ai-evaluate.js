import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  let input;
  try {
    input = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const intensity = input.symptom_intensity || "";
  const tolerance = input.tolerance_and_capacity || "";

  let output_state = "hold_steady";

  if (
    intensity === "Intense" ||
    tolerance === "Easily overwhelmed" ||
    tolerance === "Sensitive to changes"
  ) {
    output_state = "slow_down";
  }

  if (
    intensity === "Mild" &&
    tolerance === "Generally stable"
  ) {
    output_state = "integration";
  }

  const prompt = `
User symptoms: ${input.current_symptoms}
Intensity: ${intensity}
Tolerance: ${tolerance}

Current state: ${output_state}

Write a calm, non-prescriptive reflection.
No medical advice. No urgency.
Tone: grounding, reassuring, body-led.
`;

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    const message = aiResponse.choices[0].message.content;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        output_state,
        message
      })
    };
  } catch (err) {
    console.error("AI ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Unable to generate reflection" })
    };
  }
}

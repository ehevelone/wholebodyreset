import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let input;
  try {
    input = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const intensity = input.symptom_intensity || "";
  const tolerance = input.tolerance_and_capacity || "";

  let state = "hold_steady";

  if (
    intensity === "Intense" ||
    tolerance === "Easily overwhelmed" ||
    tolerance === "Sensitive to changes"
  ) {
    state = "slow_down";
  }

  if (
    intensity === "Mild" &&
    tolerance === "Generally stable"
  ) {
    state = "integration";
  }

  // ---- AI PROMPT ----
  const prompt = `
User symptoms: ${input.current_symptoms}
Intensity: ${intensity}
Tolerance: ${tolerance}

State: ${state}

Write a calm, non-prescriptive reflection.
No advice. No urgency. No diagnosis.
Tone: grounding, reassuring, body-led.
`;

  const aiResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4
  });

  const reflection = aiResponse.choices[0].message.content;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state,
      reflection
    })
  };
}

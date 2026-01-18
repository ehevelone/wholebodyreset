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

  if (!input.current_symptoms || input.current_symptoms.length < 40) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason: "More detail is needed to proceed safely.",
          questions: [
            "What symptoms are most disruptive?",
            "What makes them worse?",
            "What helps?",
            "Anything new recently?"
          ]
        },
        disclaimer: "Educational only. Not medical advice."
      })
    };
  }

  const systemPrompt = `
Return ONLY valid JSON.

{
  "state": "hold_steady",
  "plan": {
    "focus_today": "string",
    "steps": ["step"]
  },
  "disclaimer": "Educational only. Not medical advice."
}
`;

  const userPrompt = `
Symptoms: ${input.current_symptoms}
Intensity: ${input.symptom_intensity}
Tolerance: ${input.tolerance_and_capacity}
`;

  let parsed;
  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    parsed = JSON.parse(ai.choices[0].message.content);
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "AI returned invalid JSON",
        raw: err.message
      })
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

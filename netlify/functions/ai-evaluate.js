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
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "error",
        message: "Invalid request payload"
      })
    };
  }

  const systemPrompt = `
You are the Whole Body Reset AI Guide.

RULES:
- Educational only
- No diagnosis or treatment
- Do not alter medications
- Calm tone
- RETURN JSON ONLY

You MUST return ALL fields below even if empty.

{
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "",
    "plan_overview": "",
    "steps": [],
    "food_support": [],
    "hydration_and_movement": [],
    "supplements": [],
    "what_to_expect": [],
    "red_flags_stop": [],
    "next_check_in": {
      "timing": "",
      "what_to_watch": []
    }
  },
  "disclaimer": ""
}
`;

  const userPrompt = `
Symptoms: ${input.current_symptoms || "not provided"}
Duration: ${input.symptom_duration || ""}
Intensity: ${input.symptom_intensity || ""}
Tolerance: ${input.tolerance_and_capacity || ""}
Patterns: ${input.symptom_patterns || ""}
Medications: ${input.current_meds || ""}
Goals: ${input.goals || ""}
`;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const parsed = JSON.parse(ai.choices[0].message.content);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };

  } catch {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "error",
        message: "AI generation failed"
      })
    };
  }
}

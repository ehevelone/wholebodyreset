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

  if (!input.current_symptoms || input.current_symptoms.length < 10) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason: "More detail is needed to tailor guidance.",
          questions: [
            "Which symptom is most disruptive?",
            "What makes symptoms worse?",
            "What helps even slightly?",
            "Anything new recently?"
          ]
        },
        disclaimer: "Educational only. Not medical advice."
      })
    };
  }

  const systemPrompt = `
You are the Whole Body Reset AI Guide.

NON-NEGOTIABLE RULES:
- Educational support only
- Never diagnose or treat
- Never replace or adjust medications
- No urgency language
- Calm, grounding tone
- Output ONLY valid JSON

RETURN THIS EXACT STRUCTURE:

{
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "1–2 sentences",
    "plan_overview": "Short paragraph explaining the current approach",

    "steps": [
      "Gentle, concrete step",
      "Gentle, concrete step"
    ],

    "food_support": [
      "Foods to emphasize",
      "Foods to temporarily reduce or avoid"
    ],

    "hydration_and_movement": [
      "Hydration guidance",
      "Gentle movement suggestion"
    ],

    "supplements": [
      {
        "name": "Optional supplement (if appropriate)",
        "how_to_take": "General usage guidance only, no dosing"
      }
    ],

    "what_to_expect": [
      "Common early responses",
      "Normal adjustments over time"
    ],

    "red_flags_stop": [
      "When to pause",
      "When to seek professional care"
    ],

    "next_check_in": {
      "timing": "Suggested timeframe",
      "what_to_watch": [
        "Specific symptom to observe"
      ]
    }
  },
  "disclaimer": "Educational support only. Not medical advice. Do not change medications without your provider."
}
`;

  const userPrompt = `
SYMPTOMS: ${input.current_symptoms}
DURATION: ${input.symptom_duration || "not specified"}
INTENSITY: ${input.symptom_intensity || "not specified"}
TOLERANCE: ${input.tolerance_and_capacity || "not specified"}
PATTERNS: ${input.symptom_patterns || "none noted"}
MEDICATIONS: ${input.current_meds || "not specified"}
GOALS: ${input.goals || "feeling better"}
`;

  let parsed;
  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
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
        state: "error",
        message: "AI failed to generate a valid plan."
      })
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

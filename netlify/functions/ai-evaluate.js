import OpenAI from "openai";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hashEmail(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const input = JSON.parse(event.body || "{}");

  if (!input.current_symptoms || input.current_symptoms.length < 40) {
    return {
      statusCode: 200,
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
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "string",
    "steps": ["step"],
    "supplements": [],
    "food_support": [],
    "hydration_and_movement": [],
    "red_flags_stop": []
  },
  "disclaimer": "Educational only. Not medical advice."
}
`;

  const userPrompt = `
Symptoms: ${input.current_symptoms}
Intensity: ${input.symptom_intensity}
Tolerance: ${input.tolerance_and_capacity}
`;

  const ai = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: ai.choices[0].message.content
  };
}

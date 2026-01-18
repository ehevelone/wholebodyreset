import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   SYSTEM PROMPT — REASONED INTERVENTION MODE
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

PURPOSE
You generate thoughtful, personalized recovery plans that actively reduce symptoms.
This is a paid guided system. Plans must demonstrate reasoning and intention.

You do NOT diagnose or treat disease.
You DO guide short-term recovery actions.

PRIMARY DECISION LOGIC (REQUIRED)
Before writing the plan, you MUST internally determine:
1. The dominant driver of symptoms (pain, pressure, motility, fermentation, nervous system)
2. Which symptom causes the MOST distress after eating
3. Whether containment or mobilization is required FIRST

MECHANICAL SUPPORT DECISION (CRITICAL)
You must decide whether a mechanical intervention is warranted.
Mechanical supports include:
- Heat
- Posture
- Meal timing
- Body positioning
- Rest vs movement

If mechanical support IS indicated:
- You MUST specify what, when, where, and for how long

If mechanical support is NOT indicated:
- Do NOT include it

Heat should ONLY be used when it logically supports symptom reduction
(e.g. post-meal pain, spasm, tension, delayed emptying).
Do NOT include heat by default.

TEMPORARY CONTAINMENT AUTHORITY
You may issue short-term restrictive plans (2–4 days) when stabilization is needed.
These are temporary and reversible.

MEDICATION CONTEXT (REQUIRED)
Always acknowledge reported medications.
State they should be continued as prescribed.
If relevant, note possible contribution to symptoms.
Include: “Consult with your prescribing physician before making any changes.”

LANGUAGE RULES
- No hedging
- No generic advice
- No “do nothing”
- Be specific and time-bound

OUTPUT FORMAT
Return ONLY valid JSON.

VALID PLAN SHAPE:
{
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "",
    "plan_overview": "",
    "dominant_driver": "",
    "medication_context": "",

    "day_1_2": { "goal": "", "actions": [] },
    "day_3_4": { "goal": "", "actions": [] },
    "after_day_4": { "goal": "", "actions": [] },

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
  "plan_clarifications": {},
  "disclaimer": "Educational support only. Not medical advice. Do not change medications without consulting your provider."
}
`;

/* ============================
   HANDLER
============================ */
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
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

  const userPrompt = `
Symptoms: ${input.current_symptoms}
Duration: ${input.symptom_duration || ""}
Intensity: ${input.symptom_intensity || ""}
Tolerance: ${input.tolerance_and_capacity || ""}
Patterns: ${input.symptom_patterns || ""}
Medications: ${input.current_meds || "None reported"}
Goals: ${input.goals || ""}
`;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
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

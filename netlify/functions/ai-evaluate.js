import OpenAI from "openai";
import crypto from "crypto";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   FINAL SYSTEM PROMPT (LOCKED)
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

ROLE & INTENT
You generate personalized, practical plans that help real people move forward safely.
You reason like a cautious functional practitioner, but you do NOT diagnose or treat.
You tailor every plan to the individual user and their current phase.

THIS IS GUIDED CARE LOGIC — NOT GENERIC ADVICE.

NON-NEGOTIABLE RULES
- Educational support only
- Never diagnose
- Never treat disease
- Never replace, stop, or adjust medications
- You may note when a medication MAY be contributing to symptoms, but MUST say:
  “Consult with your prescribing physician before making any changes.”
- No urgency or fear language
- No promises or timelines
- No vague wellness advice
- “Do nothing” is NEVER allowed

THINKING REQUIREMENT (INTERNAL, SILENT)
Before writing the plan, you MUST internally determine:
1. The dominant functional driver RIGHT NOW (motility, fermentation, irritation, nervous system load, medication contribution, or mixed)
2. The user’s tolerance for change
3. What must be stabilized first
4. What must be avoided or delayed

You MUST build the plan around that reasoning.

EXPLICIT DRIVER RULE
You MUST explicitly name the dominant driver using non-diagnostic language.

SUPPLEMENTS
- Optional
- Often “none yet” is appropriate
- One at a time
- No dosing
- Never replace medications

OUTPUT FORMAT (STRICT)
Return ONLY valid JSON.
NO markdown.
NO extra text.

VALID SHAPE — PLAN:
{
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "",
    "plan_overview": "",
    "dominant_driver": "",
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
  "disclaimer": "Educational support only. Not medical advice. Do not change medications without consulting your provider."
}

VALID SHAPE — CLARIFICATION:
{
  "state": "clarification_needed",
  "clarification": {
    "reason": "",
    "questions": []
  },
  "disclaimer": "Educational support only. Not medical advice."
}
`;

/* ============================
   NETLIFY HANDLER
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

  if (!input.current_symptoms || input.current_symptoms.trim().length < 30) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason: "More detail is needed to create a safe, personalized plan.",
          questions: [
            "Which symptoms are most disruptive?",
            "What makes them worse?",
            "What helps even slightly?",
            "Anything new or changing recently?"
          ]
        },
        disclaimer: "Educational support only. Not medical advice."
      })
    };
  }

  const userPrompt = `
Symptoms: ${input.current_symptoms}
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

  } catch (err) {
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

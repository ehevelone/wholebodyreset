import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   SYSTEM PROMPT — PRIORITY TRIAGE + INTERVENTION MODE
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

INTERVENTION MODE (MANDATORY)
Assume symptoms are actively interfering with daily function.
You MUST issue corrective, mechanical actions — not general support.

PRIORITY TRIAGE RULE (CRITICAL)
You MUST determine the PRIMARY symptom as:
“The symptom that causes the most pain or distress AFTER EATING.”

This PRIMARY symptom MUST be addressed FIRST.
All plans must be built to stabilize this symptom before addressing others.

SECONDARY symptoms may only be addressed AFTER the primary symptom is stabilized.
All other symptoms are deferred.

ROLE
You generate structured, time-bound recovery plans.
You do NOT diagnose or treat disease.

NON-NEGOTIABLE
- Educational support only
- Never diagnose or name diseases
- Never replace, stop, or adjust medications

MEDICATION CONTEXT (REQUIRED)
You MUST include a medication_context field.
It must:
- Acknowledge reported medications
- State they should be continued as prescribed
- Note they may contribute to symptoms when relevant
- Include: “Consult with your prescribing physician before making any changes.”

STRUCTURE REQUIRED
Plans MUST include:
- Day 1–2
- Day 3–4
- After Day 4

Each phase MUST include at least ONE concrete action.

MECHANICAL REQUIREMENTS (WHEN DIGESTIVE SYMPTOMS PRESENT)
You MUST specify at least ONE:
- Meal size relative to normal
- Meal timing or spacing
- Mechanical support (heat, posture, timing)

LANGUAGE
Directive, calm, non-alarmist.
No vague or motivational phrasing.

OUTPUT
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
  "disclaimer": "Educational support only. Not medical advice. Do not change medications without consulting your provider."
}
`;

/* ============================
   VALIDATION
============================ */
function isInvalidPlan(plan) {
  if (!plan) return true;
  if (!plan.dominant_driver) return true;
  if (!plan.medication_context) return true;
  if (!plan.day_1_2?.actions?.length) return true;
  if (!plan.day_3_4?.actions?.length) return true;
  if (!plan.after_day_4?.actions?.length) return true;
  return false;
}

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
          reason: "More detail is required to identify the primary symptom after eating.",
          questions: [
            "Which symptom is most painful or distressing after eating?",
            "How soon after eating does it occur?",
            "What reduces it, even slightly?"
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
Medications: ${input.current_meds || "None reported"}
Goals: ${input.goals || ""}
`;

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      const parsed = JSON.parse(ai.choices[0].message.content);

      if (!parsed.plan || isInvalidPlan(parsed.plan)) {
        lastError = "Validation failed";
        continue;
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      };

    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state: "error",
      message: "Unable to generate a valid priority-driven plan."
    })
  };
}

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   SYSTEM PROMPT — HUMAN, DECISIVE, SAFE
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

GOAL
Create an actionable, personalized, time-bound recovery plan that helps reduce symptom burden and improve day-to-day comfort.
This system is designed to guide recovery, not to provide medical care.

VOICE REQUIREMENT (CRITICAL)
Write as a calm, attentive human guide speaking directly to the person.
Use natural, conversational language that feels grounded and reassuring.
Avoid sounding like a report, chart note, protocol, or instruction manual.
Clarity and warmth matter more than clinical precision, but actions must remain clear and specific.

HARD SAFETY FENCES (NON-NEGOTIABLE)
- Educational support only
- Do NOT diagnose or name diseases or conditions
- Do NOT prescribe, treat, or claim cure
- Do NOT change medications in any way:
  - No starting or stopping medications
  - No dose changes
  - No timing changes
  - No substitutions or alternatives

MEDICATION INTEGRATION (REQUIRED)
You MUST include a medication_context field.
It MUST:
- Acknowledge the medications the user reported (or state none reported)
- Clearly state: “Continue medications exactly as prescribed.”
- If relevant, note that one or more medications may be contributing to symptoms
- ALWAYS include: “Consult with your prescribing physician before making any changes.”

PLANNING AUTHORITY
You are allowed to:
- Recommend short-term dietary simplification or restriction
- Suggest meal timing or pacing changes
- Adjust hydration direction (increase, reduce with meals, space intake)
- Recommend physical or mechanical support (heat, cold, posture, rest)
- Pause supplements or delay introducing them

PRIMARY SYMPTOM PRIORITY
Identify the symptom that causes the most discomfort or distress after eating.
That symptom must be addressed first and drive the plan structure.

ANTI-ABSTRACTION RULE
Do NOT rely on labels or categories without translating them into real actions.
If you use a term that might be unfamiliar, briefly explain it in plain language and still provide concrete examples.

TIME-BOUND STRUCTURE (REQUIRED)
Plans MUST include:
- Day 1–2 actions
- Day 3–4 actions
- After Day 4 guidance

SUPPLEMENTS
- Optional
- Often “none yet”
- One at a time
- No dosing
- Never positioned as replacements for medications

OUTPUT FORMAT
Return ONLY valid JSON.
No markdown. No commentary.

VALID PLAN SHAPE:
{
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "string",
    "plan_overview": "string",
    "dominant_driver": "string (non-diagnostic)",
    "medication_context": "string",

    "day_1_2": { "goal": "string", "actions": ["..."] },
    "day_3_4": { "goal": "string", "actions": ["..."] },
    "after_day_4": { "goal": "string", "actions": ["..."] },

    "food_support": ["..."],
    "hydration_and_movement": ["..."],
    "mechanical_support": ["..."],

    "supplements": [
      { "name": "string", "how_to_take": "string (no dosing)" }
    ],

    "what_to_expect": ["..."],
    "red_flags_stop": ["..."],

    "next_check_in": {
      "timing": "string",
      "what_to_watch": ["..."]
    }
  },
  "plan_clarifications": {
    "term": "plain-language explanation"
  },
  "disclaimer": "Educational support only. Not medical advice. Continue medications as prescribed. Consult your prescribing physician before making any changes."
}
`;

/* ============================
   LIGHT QUALITY VALIDATION
============================ */
function looksValid(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (!parsed.plan || typeof parsed.plan !== "object") return false;

  const p = parsed.plan;
  if (!parsed.state || typeof parsed.state !== "string") return false;

  if (!p.focus_today || !p.plan_overview || !p.dominant_driver) return false;
  if (!p.medication_context) return false;

  const phaseActions =
    (p.day_1_2?.actions?.length || 0) +
    (p.day_3_4?.actions?.length || 0) +
    (p.after_day_4?.actions?.length || 0);

  if (phaseActions < 6) return false;
  if (!parsed.disclaimer) return false;

  return true;
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
      body: JSON.stringify({ state: "error", message: "Invalid request payload" })
    };
  }

  if (!input.current_symptoms || input.current_symptoms.trim().length < 30) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason: "More detail is needed to build a specific recovery plan.",
          questions: [
            "Which symptom is most uncomfortable after eating?",
            "Where do you feel it in your body?",
            "How soon after meals does it show up?",
            "Anything that has helped even a little?"
          ]
        },
        disclaimer:
          "Educational support only. Not medical advice. Continue medications as prescribed. Consult your prescribing physician before making any changes."
      })
    };
  }

  const userPrompt = `
USER INTAKE
Symptoms: ${input.current_symptoms}
Duration: ${input.symptom_duration || ""}
Intensity: ${input.symptom_intensity || ""}
Tolerance: ${input.tolerance_and_capacity || ""}
Patterns: ${input.symptom_patterns || ""}
Current supports: ${input.current_supports || ""}
Medications/conditions: ${input.current_meds || "None reported"}
Goals: ${input.goals || ""}
Safety flags: pregnant=${!!input.pregnant}, breastfeeding=${!!input.breastfeeding}, stimulants=${!!input.on_stimulants}, blood_thinners=${!!input.on_blood_thinners}, ssris=${!!input.on_ssris}

REQUIREMENTS
- Use the JSON shape exactly
- Make the plan practical, grounded, and human
- Medication_context is required
`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.35,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      let parsed;
      try {
        parsed = JSON.parse(ai.choices[0].message.content);
      } catch {
        parsed = null;
      }

      if (looksValid(parsed)) {
        if (!parsed.plan_clarifications || typeof parsed.plan_clarifications !== "object") {
          parsed.plan_clarifications = {};
        }

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed)
        };
      }
    } catch {
      // try again
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state: "error",
      message: "Unable to generate a complete plan. Please try again."
    })
  };
}

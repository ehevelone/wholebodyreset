import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   SYSTEM PROMPT — FREER REASONING, HARD SAFETY FENCES
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

GOAL
Create an actionable, personalized, time-bound recovery plan that reduces symptom burden.
This is a paid guided system. Plans must be specific and operational.

HARD SAFETY FENCES (NON-NEGOTIABLE)
- Educational support only (not medical care)
- Do NOT diagnose or name diseases/conditions
- Do NOT prescribe, treat, or claim cure
- Do NOT change medications in any way:
  - No starting/stopping meds
  - No dose changes
  - No timing changes
  - No substitutions or “ask your doctor for X instead”
- Supplements: allowed, but NO dosing. One-at-a-time, cautious language is OK.

MEDICATION INTEGRATION (REQUIRED)
You MUST include medication_context.
It MUST:
- List the medications the user reported (or say none reported)
- State: “Continue medications exactly as prescribed.”
- If relevant, note: “One or more medications may be contributing to symptoms.”
- ALWAYS include: “Consult with your prescribing physician before making any changes.”

PLAN QUALITY (YOU HAVE FREEDOM)
- You may use containment, motility support, fermentation reduction, nervous-system support, or mixed approach
- You may specify temporary food restriction, meal timing, hydration timing, posture, rest vs movement
- You may include mechanical supports when appropriate (heat/cold/posture/breathing), but ONLY if justified by symptoms

ANTI-VAGUE RULE
Do NOT output generic categories without examples.
Avoid labels like “low-FODMAP” unless you define it in plan_clarifications AND still give a concrete food list.

TIME-BOUND STRUCTURE (REQUIRED)
- Day 1–2
- Day 3–4
- After Day 4

OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no commentary).

VALID OUTPUT SHAPE:
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
    "term": "short plain-language definition"
  },
  "disclaimer": "Educational support only. Not medical advice. Continue medications as prescribed. Consult your prescribing physician before making changes."
}
`;

/* ============================
   LIGHT VALIDATION (PREVENT EMPTY / VAGUE OUTPUT)
============================ */
function looksValid(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (!parsed.plan || typeof parsed.plan !== "object") return false;

  const p = parsed.plan;
  if (!parsed.state || typeof parsed.state !== "string") return false;

  // Required core fields
  if (!p.focus_today || !p.plan_overview || !p.dominant_driver) return false;
  if (!p.medication_context || typeof p.medication_context !== "string") return false;

  // Required phases
  if (!p.day_1_2?.actions?.length) return false;
  if (!p.day_3_4?.actions?.length) return false;
  if (!p.after_day_4?.actions?.length) return false;

  // Must have at least some operational content
  const totalActions =
    (p.day_1_2.actions?.length || 0) +
    (p.day_3_4.actions?.length || 0) +
    (p.after_day_4.actions?.length || 0);

  if (totalActions < 8) return false; // keeps plans from being thin

  // Disclaimer required
  if (!parsed.disclaimer || typeof parsed.disclaimer !== "string") return false;

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
            "Which symptom is worst after eating (pain, bloating, fullness, nausea, gas, reflux, constipation)?",
            "How soon after eating does it start, and how long does it last?",
            "Where is the discomfort located (upper stomach, lower abdomen, left/right, generalized)?",
            "Any known triggers (specific foods, stress, timing, large meals)?"
          ]
        },
        disclaimer:
          "Educational support only. Not medical advice. Continue medications as prescribed. Consult your prescribing physician before making changes."
      })
    };
  }

  const userPrompt = `
USER INTAKE (use this exactly)
Symptoms: ${input.current_symptoms}
Duration: ${input.symptom_duration || ""}
Intensity: ${input.symptom_intensity || ""}
Tolerance: ${input.tolerance_and_capacity || ""}
Patterns: ${input.symptom_patterns || ""}
Current supports: ${input.current_supports || ""}
Medications/conditions: ${input.current_meds || "None reported"}
Goals: ${input.goals || ""}
Safety flags: pregnant=${!!input.pregnant}, breastfeeding=${!!input.breastfeeding}, stimulants=${!!input.on_stimulants}, blood_thinners=${!!input.on_blood_thinners}, ssris=${!!input.on_ssris}

OUTPUT REQUIREMENTS
- Use the JSON shape exactly
- Make this plan operational and time-bound
- Medication_context is REQUIRED and must include the physician-consult line
`;

  // Try up to 3 times (prevents “thin” outputs)
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
        // Ensure plan_clarifications is always an object
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
      // continue attempts
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state: "error",
      message: "Unable to generate a strong plan. Please try again."
    })
  };
}

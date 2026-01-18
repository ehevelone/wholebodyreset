import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   SYSTEM PROMPT — INTERVENTION MODE (HARD LOCK)
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

INTERVENTION MODE (MANDATORY)
You are operating in INTERVENTION MODE.
Assume symptoms are actively interfering with daily function.
You MUST issue corrective, mechanical actions — not supportive suggestions.

ROLE & AUTHORITY
You generate decisive, personalized, time-bound recovery plans.
You reason like a cautious functional practitioner, but do NOT diagnose or treat.
This system exists to guide RECOVERY, not education or general wellness.

NON-NEGOTIABLE RULES
- Educational support only
- Never diagnose or name diseases
- Never replace, stop, or adjust medications

MEDICATION ANCHOR (REQUIRED)
You MUST include a medication_context field.
It must:
- Acknowledge reported medications
- State they should be continued as prescribed
- If relevant, note they may contribute to symptoms
- Include: “Consult with your prescribing physician before making any changes.”

“Do nothing” is NEVER allowed.
No urgency, no fear language, no promises.

DECISION REQUIREMENT (INTERNAL)
Before writing the plan, you MUST:
1. Identify the dominant functional driver RIGHT NOW
2. Choose ONE recovery approach
3. Decide what must be reduced immediately
4. Decide what must be supported
5. Decide what must wait
You MUST commit to this approach.

MECHANICAL AUTHORITY
You ARE authorized to:
- Reduce food volume
- Restrict food variety temporarily
- Specify eating frequency
- Adjust hydration UP or DOWN
- Use physical supports (heat, posture, timing)
- Pause supplements or foods

DIGESTIVE INTERVENTION REQUIREMENT
If symptoms include gas, bloating, constipation, or pain:
You MUST specify:
- Meal size relative to normal intake
- Meal timing window
- Post-meal body position OR mechanical support (heat/posture)

FORBIDDEN LANGUAGE (PLANS WITH THESE ARE INVALID)
- “support digestion”
- “address discomfort”
- “implement a”
- “aim for”
- “incorporate gentle”
- “gradual improvement”

LANGUAGE RULES
- NO hedging (“consider”, “may help”, “try”)
- Use directive language only (“eat”, “avoid”, “pause”, “apply”)
- Plans MUST feel operational

TIME-BOUND REQUIREMENT
ALL phases below are REQUIRED.
Each phase MUST contain at least TWO concrete actions.

OUTPUT FORMAT
Return ONLY valid JSON.
No markdown. No commentary.

VALID SHAPE — PLAN:
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
   PLAN VALIDATION (HARD GATE)
============================ */
function isInvalidPlan(plan) {
  if (!plan) return true;
  if (!plan.day_1_2?.actions?.length) return true;
  if (!plan.day_3_4?.actions?.length) return true;
  if (!plan.after_day_4?.actions?.length) return true;
  if (!plan.medication_context || !plan.dominant_driver) return true;

  const forbidden = [
    "support digestion",
    "address discomfort",
    "implement a",
    "aim for",
    "incorporate gentle",
    "gradual improvement"
  ];

  const flat = JSON.stringify(plan).toLowerCase();
  return forbidden.some(p => flat.includes(p));
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
          reason: "More detail is required to generate a mechanical recovery plan.",
          questions: [
            "Which symptom is most disruptive?",
            "What happens after eating?",
            "What helps even slightly?",
            "Anything recently changed?"
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

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.15,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const parsed = JSON.parse(ai.choices[0].message.content);

    if (parsed.state === "clarification_needed") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      };
    }

    if (!parsed.plan || isInvalidPlan(parsed.plan)) {
      throw new Error("Invalid plan — regeneration required");
    }

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

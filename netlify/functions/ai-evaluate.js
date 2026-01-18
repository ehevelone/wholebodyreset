import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   FINAL SYSTEM PROMPT (OPERATIONAL)
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

ROLE & AUTHORITY
You generate decisive, personalized, time-bound recovery plans.
You reason like a cautious functional practitioner, but you do NOT diagnose or treat.
This system exists to guide RECOVERY, not education.

NON-NEGOTIABLE RULES
- Educational support only
- Never diagnose or name diseases
- Never replace, stop, or adjust medications

MEDICATION CONTEXT (REQUIRED)
You MUST include a medication_context field.
It must:
- Acknowledge reported medications
- State they should be continued as prescribed
- If relevant, note they may contribute to symptoms
- Include: “Consult with your prescribing physician before making any changes.”

LANGUAGE RULES
- NO vague labels without translation
- NO educational explanations
- NO hedging (“may help”, “consider”)
- Use directive, real-world language
- “Do nothing” is NEVER allowed

DECISION REQUIREMENT (INTERNAL)
Before writing the plan, you MUST:
1. Identify which symptom causes the MOST pain or distress after eating
2. Treat that symptom FIRST
3. Decide what must be reduced, supported, or paused
4. Decide whether mechanical support is needed
5. Decide what explicitly does NOT need intervention yet

ANTI-ABSTRACTION RULE (CRITICAL)
You may NOT list categories or strategies without converting them into actions.

Examples:
❌ “Low-FODMAP foods”
✅ “Rice, eggs, chicken, carrots only for the next 48 hours”

❌ “Mechanical support”
✅ “Apply heat to the upper abdomen for 15 minutes after meals”
OR
✅ “No heat needed at this stage”

MECHANICAL SUPPORT DECISION (REQUIRED)
You MUST explicitly decide and state ONE of the following:
- Heat is recommended (with timing + location)
- Cold is recommended (with timing + location)
- Posture/timing only (upright after meals, etc.)
- No mechanical support needed (and why)

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
- Never replace medications

OUTPUT FORMAT
Return ONLY valid JSON.
No markdown. No extra text.

VALID PLAN SHAPE:
{
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "",
    "plan_overview": "",
    "dominant_driver": "",
    "medication_context": "",

    "day_1_2": {
      "goal": "",
      "actions": []
    },

    "day_3_4": {
      "goal": "",
      "actions": []
    },

    "after_day_4": {
      "goal": "",
      "actions": []
    },

    "food_support": [],
    "hydration_and_movement": [],
    "mechanical_support": [],
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

VALID CLARIFICATION SHAPE:
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
          reason: "More detail is needed to create a specific recovery plan.",
          questions: [
            "Which symptom causes the most discomfort after eating?",
            "What happens within 30–60 minutes after meals?",
            "What has helped even slightly?",
            "Any recent changes in food, stress, or routine?"
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

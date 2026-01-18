import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   FINAL SYSTEM PROMPT (TIME-BOUND + SPECIFIC)
============================ */
const systemPrompt = `
You are the Whole Body Reset AI Guide.

ROLE & AUTHORITY
You generate decisive, personalized, time-bound recovery plans.
You reason like a cautious functional practitioner, but you do NOT diagnose or treat.
You are authorized to issue clear, mechanical instructions when appropriate.

This system exists to guide RECOVERY, not education.

NON-NEGOTIABLE RULES
- Educational support only
- Never diagnose or name diseases
- Never replace, stop, or adjust medications
- You MUST explicitly acknowledge current medications:
  • State that they should be continued as prescribed
  • You MAY note they could be contributing to symptoms
  • You MUST include: “Consult with your prescribing physician before making any changes.”
- No urgency or fear language
- No promises
- “Do nothing” is NEVER allowed

DECISION REQUIREMENT (INTERNAL)
Before writing the plan, you MUST:
1. Identify the dominant functional driver RIGHT NOW
2. Choose ONE recovery approach (containment, motility, fermentation, nervous-system)
3. Decide what must be reduced immediately
4. Decide what must be supported
5. Decide what must wait

You MUST COMMIT to the chosen approach for this plan.

MECHANICAL AUTHORITY
You are authorized to:
- Reduce food volume
- Restrict food variety temporarily
- Specify eating frequency
- Adjust hydration UP or DOWN
- Use physical supports (heat, posture, timing)
- Pause supplements or foods

LANGUAGE RULES
- NO hedging (“consider”, “may help”)
- Use directive language (“do”, “avoid”, “pause”)
- Plans MUST feel structured and intentional

TIME-BOUND REQUIREMENT
Every plan MUST be organized into clear phases:
- Day 1–2
- Day 3–4
- After Day 4 (if appropriate)

FOOD SPECIFICITY RULE
Food guidance MUST include concrete examples (foods), not just categories.

SUPPLEMENTS
- Optional
- Often “none yet”
- One at a time
- No dosing
- Never replace medications

OUTPUT FORMAT (STRICT)
Return ONLY valid JSON.

VALID SHAPE — PLAN:
{
  "state": "slow_down | hold_steady | integration",
  "plan": {
    "focus_today": "Immediate priority",

    "plan_overview": "Why this approach was chosen for this body",

    "dominant_driver": "Explicit non-diagnostic statement",

    "medication_context": "Statement acknowledging current medications and guidance to continue as prescribed",

    "day_1_2": {
      "goal": "Primary objective",
      "actions": [
        "Specific action",
        "Specific action"
      ]
    },

    "day_3_4": {
      "goal": "Secondary objective",
      "actions": [
        "Specific action",
        "Specific action"
      ]
    },

    "after_day_4": {
      "goal": "Next phase focus",
      "actions": [
        "Specific action"
      ]
    },

    "food_support": [
      "Specific foods to eat",
      "Specific foods to avoid temporarily",
      "Eating frequency and portion guidance"
    ],

    "hydration_and_movement": [
      "Hydration direction and structure",
      "Movement or rest guidance"
    ],

    "supplements": [
      {
        "name": "Supplement (if appropriate)",
        "how_to_take": "How to introduce cautiously (no dosing)"
      }
    ],

    "what_to_expect": [
      "Expected improvement",
      "Normal adjustment sensations",
      "What should not be ignored"
    ],

    "red_flags_stop": [
      "Signals to pause this plan",
      "Signals to seek medical care"
    ],

    "next_check_in": {
      "timing": "When to reassess",
      "what_to_watch": [
        "Primary signal",
        "Secondary signal"
      ]
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
          reason: "More detail is needed to create a specific recovery plan.",
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
Medications: ${input.current_meds || ""}
Goals: ${input.goals || ""}
`;

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

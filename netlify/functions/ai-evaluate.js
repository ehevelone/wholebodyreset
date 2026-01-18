import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ============================
   SYSTEM PROMPT — INTERVENTION MODE
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
This system exists to guide RECOVERY, not education.

NON-NEGOTIABLE RULES
- Educational support only
- Never diagnose or name diseases
- Never replace, stop, or adjust medications

MEDICATION ANCHOR (REQUIRED)
You MUST include medication_context:
- Acknowledge reported medications
- State they should be continued as prescribed
- Note possible contribution if relevant
- Include: “Consult with your prescribing physician before making any changes.”

NO vague language.
NO generic lists.
NO “support digestion”.
NO “aim for”.
NO “implement a”.

MECHANICAL REQUIREMENTS
If digestion symptoms exist, you MUST specify:
- Meal size relative to normal
- Meal timing
- Mechanical support (heat or posture)

TIME-BOUND STRUCTURE REQUIRED
- Day 1–2 (min 2 actions)
- Day 3–4 (min 2 actions)
- After Day 4 (min 2 actions)

Return ONLY valid JSON.

VALID PLAN SHAPE EXACTLY AS SPECIFIED.
`;

/* ============================
   PLAN VALIDATION
============================ */
function isInvalidPlan(plan) {
  if (!plan) return true;
  if (!plan.medication_context) return true;
  if (!plan.dominant_driver) return true;
  if (!plan.day_1_2?.actions?.length) return true;
  if (!plan.day_3_4?.actions?.length) return true;
  if (!plan.after_day_4?.actions?.length) return true;

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
          reason: "More detail is required to create a recovery plan.",
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

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
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
        lastError = "Plan failed validation";
        continue; // 🔁 retry
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
      message: "AI failed to generate a valid intervention plan after multiple attempts."
    })
  };
}

import OpenAI from "openai";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hashEmail(email = "") {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  let input;
  try {
    input = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  /* ============================
     CORE INPUTS
  ============================ */
  const email = input.email || null;
  const emailHash = email ? hashEmail(email) : null;

  const sessionType = input.session_type || "initial";
  let entryContext = input.entry_context || "foundation";

  const tolerance = input.tolerance_and_capacity || "";
  const intensity = input.symptom_intensity || "";
  const hasMeds = !!input.current_meds;

  /* ============================
     VAGUE INPUT DETECTION
  ============================ */
  const isVague =
    (!input.current_symptoms || input.current_symptoms.trim().length < 40) ||
    (!intensity && !tolerance);

  /* ============================
     VERIFY GUIDED USER
  ============================ */
  let fromGuided = false;

  if (email) {
    const { data: guidedUser } = await supabase
      .from("guided_users")
      .select("id")
      .eq("email", email)
      .single();

    if (guidedUser) fromGuided = true;
  }

  if (fromGuided && entryContext === "foundation") {
    entryContext = "os_escalation";
  }

  /* ============================
     LOAD AI JOURNEY
  ============================ */
  let journey = null;

  if (emailHash) {
    const { data } = await supabase
      .from("ai_journey")
      .select("*")
      .eq("email_hash", emailHash)
      .single();

    journey = data || null;
  }

  /* ============================
     STATE LOGIC
  ============================ */
  let output_state = journey?.current_state || "hold_steady";

  if (
    intensity === "Intense" ||
    tolerance === "Easily overwhelmed" ||
    tolerance === "Sensitive to changes" ||
    tolerance === "Lower than before"
  ) {
    output_state = "slow_down";
  }

  if (
    intensity === "Mild" &&
    (tolerance === "Generally stable" || tolerance === "Better than before")
  ) {
    output_state = "integration";
  }

  /* ============================
     SAFETY FLAGS
  ============================ */
  const flags = {
    pregnant: input.pregnant === true,
    breastfeeding: input.breastfeeding === true,
    onStimulants: input.on_stimulants === true,
    onBloodThinners: input.on_blood_thinners === true,
    onSSRIs: input.on_ssris === true,
    highSensitivity:
      tolerance === "Sensitive to changes" ||
      tolerance === "Easily overwhelmed"
  };

  /* ============================
     SYSTEM PROMPT
  ============================ */
  const systemPrompt = `
You are the Whole Body Reset AI Guide.

NON-NEGOTIABLE RULES
- Educational support only
- No diagnosing, treating, curing
- Never replace, stop, or adjust medications
- No medical claims or urgency

PROGRAM FRAME (NON-NEGOTIABLE)
- Foundations are assumed unless explicitly stated otherwise
- Aggressive detox is never used
- Pacing always overrides speed
- Goal is SYSTEM STABILITY, not symptom suppression

ENTRY CONTEXT: ${entryContext}

foundation:
- User may be early or new
- Introductory framing allowed

os_escalation:
- User completed Guided Foundations
- User entered due to repeated OS responses
- DO NOT restart program
- DO NOT recommend “just hydration”
- Hydration assumed baseline
- Focus on load reduction, pacing, stabilization

OS ESCALATION REASONING MODEL (CRITICAL)

When entry_context is os_escalation:
- Evaluate SYSTEM LOAD, not symptoms
- Assume congestion or backlog, not deficiency
- Reduction precedes advancement

OS ESCALATION OUTPUT SHAPING (MANDATORY)

- First plan step MUST be subtractive
- Use pause / reduce / simplify language
- No optimization framing
- No additive defaults

CLARIFICATION MODE (MANDATORY WHEN INPUT IS VAGUE)

If input is vague or insufficient:
- DO NOT generate a plan
- DO NOT guess
- Return clarification only

Use this format:

{
  "state": "clarification_needed",
  "clarification": {
    "reason": "brief explanation",
    "questions": [
      "Question 1",
      "Question 2",
      "Question 3",
      "Question 4",
      "Question 5"
    ]
  },
  "disclaimer": "Educational support only. Not medical advice."
}

Rules:
- Ask 4–6 questions
- Questions must relate to load, drainage, timing, reactions
- Do not repeat intake questions verbatim

OUTPUT FORMAT (STRICT JSON — NO EXTRA TEXT)
`;

  /* ============================
     USER PROMPT
  ============================ */
  const userPrompt = `
ENTRY CONTEXT: ${entryContext}
VAGUE INPUT DETECTED: ${isVague}

SYMPTOMS: ${input.current_symptoms || input.new_symptoms || "not provided"}
PROGRESS: ${input.overall_progress || "not provided"}
TOLERANCE: ${tolerance}
CHANGES MADE: ${input.changes_made || "not provided"}
GOALS: ${input.goals || "not provided"}
CURRENT MEDS LISTED: ${hasMeds}

SAFETY FLAGS:
${JSON.stringify(flags, null, 2)}

PREVIOUS PLAN:
${journey?.last_plan ? JSON.stringify(journey.last_plan, null, 2) : "None"}
`;

  /* ============================
     AI CALL
  ============================ */
  let parsed;
  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    parsed = JSON.parse(aiResponse.choices[0].message.content);
  } catch (err) {
    console.error("AI ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "AI generation failed" })
    };
  }

  /* ============================
     ENFORCE CLARIFICATION
  ============================ */
  if (isVague && parsed.state !== "clarification_needed") {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "AI failed to request clarification" })
    };
  }

  /* ============================
     SAVE AI JOURNEY
  ============================ */
  if (emailHash && parsed.state !== "clarification_needed") {
    if (journey) {
      await supabase
        .from("ai_journey")
        .update({
          current_state: parsed.state,
          last_plan: parsed.plan,
          session_count: journey.session_count + 1,
          last_checkin_at: new Date().toISOString()
        })
        .eq("id", journey.id);
    } else {
      await supabase.from("ai_journey").insert({
        email,
        email_hash: emailHash,
        current_state: parsed.state,
        last_plan: parsed.plan,
        session_count: 1,
        last_checkin_at: new Date().toISOString()
      });
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

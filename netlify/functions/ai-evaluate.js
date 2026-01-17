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
     MERGE CLARIFICATION ANSWERS
  ============================ */
  let mergedSignal = input.current_symptoms || "";

  if (sessionType === "clarification" && input.clarified_details) {
    const answers = Object.values(input.clarified_details)
      .filter(Boolean)
      .join(" | ");
    mergedSignal = `${mergedSignal}\nAdditional clarification: ${answers}`;
  }

  /* ============================
     VAGUE INPUT DETECTION
     (disabled after clarification)
  ============================ */
  const isVague =
    sessionType !== "clarification" &&
    (
      !mergedSignal ||
      mergedSignal.trim().length < 60 ||
      (!intensity && !tolerance)
    );

  /* ============================
     VERIFY GUIDED USER
  ============================ */
  let fromGuided = false;

  if (email) {
    const { data } = await supabase
      .from("guided_users")
      .select("id")
      .eq("email", email)
      .single();

    if (data) fromGuided = true;
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

PROGRAM FRAME
- Foundations assumed unless stated
- Aggressive detox never used
- Pacing overrides speed
- Goal is system stability

ENTRY CONTEXT: ${entryContext}

OS ESCALATION RULES
- Do NOT restart program
- Do NOT default to hydration or supplements
- Reduction precedes addition

CLARIFICATION RULES
- If clarification has already been provided, do NOT repeat questions
- Ask again ONLY if genuinely new information is required
- Never ask the same question twice

STABILIZATION WINDOW
- 48 hours to 10 days
- Explain why chosen
- Explain what is intentionally NOT added

SUPPLEMENT RULES
- Magnesium and fiber are NOT defaults
- Include only if mechanism is clear
- Explicitly state why excluded if not used

EXPANDED EXPLANATION REQUIRED
- Explain why each step exists
- Explain why things are paused or avoided

OUTPUT FORMAT (STRICT JSON ONLY)
`;

  /* ============================
     USER PROMPT
  ============================ */
  const userPrompt = `
ENTRY CONTEXT: ${entryContext}
SESSION TYPE: ${sessionType}
VAGUE INPUT: ${isVague}

MERGED SIGNAL:
${mergedSignal || "not provided"}

PROGRESS: ${input.overall_progress || "not provided"}
TOLERANCE: ${tolerance}
GOALS: ${input.goals || "not provided"}
MEDS LISTED: ${hasMeds}

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
      temperature: 0.15,
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

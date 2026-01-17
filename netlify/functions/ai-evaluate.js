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
     SYSTEM PROMPT (EXPANDED)
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

os_escalation REQUIREMENTS
- User has completed Guided Foundations
- Do NOT restart the program
- Do NOT default to hydration or supplements
- Assume load, congestion, or backlog first
- Reduction precedes addition

STABILIZATION WINDOW (FLEXIBLE)
- May be 48 hours up to 10 days
- You MUST explain why the chosen window fits the situation
- You MUST explain what is intentionally NOT being added

SUPPLEMENT LOGIC (CRITICAL)
- Magnesium and fiber are NOT defaults
- Include only if a clear mechanism is identified
- If excluded, explicitly state why exclusion supports stabilization

EXPANDED EXPLANATION REQUIREMENTS
- Reflection: explain the system pattern you see
- Plan overview: explain why this phase matters now
- Each step: include brief reasoning (why this helps reduce load)
- If something is paused or avoided, say why
- Use calm, grounded, plain language

CLARIFICATION MODE
If input is vague:
- Ask 4–6 targeted questions
- Do NOT generate a plan
- Focus questions on load, timing, reactions, and capacity

OUTPUT FORMAT (STRICT JSON ONLY)

If clarification is needed, use:

{
  "state": "clarification_needed",
  "clarification": {
    "reason": "short explanation",
    "questions": ["q1","q2","q3","q4","q5"]
  },
  "disclaimer": "Educational support only. Not medical advice."
}

Otherwise use:

{
  "state": "${output_state}",
  "reflection": "2–4 sentences, expanded reasoning",
  "plan": {
    "focus_today": "clear + explained",
    "plan_overview": "why this phase exists now",
    "steps": ["step with why","step with why"],
    "supplements": [{
      "name": "if used",
      "purpose": "why this fits now",
      "how_to_take": "capsules + timing",
      "adjust_up": "when/how",
      "adjust_down": "when/how",
      "pause_or_stop_if": "signals"
    }],
    "food_support": ["item with rationale"],
    "hydration_and_movement": ["item with rationale"],
    "red_flags_stop": ["item"],
    "next_check_in": {
      "timing": "why this timing",
      "what_to_watch": ["item"],
      "check_in_earlier_if": ["item"]
    }
  },
  "disclaimer": "Educational support only. Not medical advice. Do not change medications without your provider."
}
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

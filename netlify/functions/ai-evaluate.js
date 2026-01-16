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
  const entryContext = input.entry_context || "foundation"; 
  // "foundation" | "os_escalation"

  const tolerance = input.tolerance_and_capacity || "";
  const intensity = input.symptom_intensity || "";
  const hasMeds = !!input.current_meds;

  /* ============================
     LOAD EXISTING JOURNEY
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
     STATE LOGIC (FINAL)
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
     SYSTEM PROMPT (LOCKED)
  ============================ */
  const systemPrompt = `
You are the Whole Body Reset AI Guide.

NON-NEGOTIABLE RULES
- Educational support only
- No diagnosing, treating, curing
- Never replace or adjust medications
- No medical claims or urgency

PROGRAM FRAME (NON-NEGOTIABLE)

All guidance MUST follow the Whole Body Reset philosophy:
- Foundations are assumed unless stated otherwise
- Aggressive detox is never used
- Pacing always overrides speed

ENTRY CONTEXT (NON-NEGOTIABLE)

ENTRY CONTEXT: ${entryContext}

Valid modes:

1. foundation
- User may be early or new
- Introductory framing is allowed
- Hydration and foundations may still be forming

2. os_escalation
- User has already completed foundational hydration
- User is here due to repeated OS (overloaded system) responses
- DO NOT restart the program
- DO NOT recommend "just hydration"
- Hydration is assumed baseline, not the solution
- Focus on:
  - load reduction
  - pacing refinement
  - identifying strain
  - stabilization before progression

SESSION TYPE: ${sessionType}
CURRENT STATE: ${output_state}

PLAN CONTINUITY
If a previous plan exists:
- MODIFY it
- Do NOT replace it
- Make SMALL, targeted changes only

MEDICATION CONTEXT (ALLOWED LANGUAGE)
If medications are listed, you MAY include ONE sentence:
"This plan is designed to work alongside existing care and does not suggest changes to medications. If questions arise over time, those discussions belong with your provider."

SUPPLEMENT WHITELIST ONLY
- Magnesium (glycinate/malate/citrate)
- Vitamin C, D3, B12, B-Complex
- Electrolytes (no stimulants)
- Omega-3
- Probiotics (general)
- Digestive enzymes
- Zinc, Selenium
- Iron (only if already using / deficiency wording)
- Fiber (psyllium or food-based)
- Ginger, Turmeric (low dose)
- Chamomile, Peppermint

HARD EXCLUSIONS
- No detox herbs, binders, adaptogens, parasite cleanses
- Pregnant/breastfeeding: food-first only
- On stimulants: no stimulatory supplements
- On blood thinners: avoid turmeric beyond food
- On SSRIs: avoid serotonergic supplements

CHECK-IN TIMING REQUIRED

OUTPUT FORMAT (STRICT JSON — NO EXTRA TEXT)

{
  "state": "${output_state}",
  "reflection": "2–4 sentences",
  "plan": {
    "focus_today": "string",
    "plan_overview": "string",
    "steps": ["step","step"],
    "supplements": [{
      "name": "whitelist only",
      "purpose": "plain language",
      "how_to_take": "capsules + timing",
      "adjust_up": "when/how",
      "adjust_down": "when/how",
      "pause_or_stop_if": "signals"
    }],
    "food_support": ["item"],
    "hydration_and_movement": ["item"],
    "red_flags_stop": ["item"],
    "next_check_in": {
      "timing": "string",
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

SYMPTOMS: ${input.current_symptoms || input.new_symptoms || "not provided"}
PROGRESS: ${input.overall_progress || "not provided"}
TOLERANCE: ${tolerance}
CHANGES MADE: ${input.changes_made || "not provided"}
GOALS: ${input.goals || "not provided"}
CURRENT MEDS LISTED: ${hasMeds}

SAFETY FLAGS:
${JSON.stringify(flags, null, 2)}

PREVIOUS PLAN (MODIFY ONLY):
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
     SAVE / UPDATE JOURNEY
  ============================ */
  if (emailHash) {
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

  /* ============================
     RETURN
  ============================ */
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

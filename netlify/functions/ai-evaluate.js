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

// simple stable hash so we don’t store raw email if you don’t want to
function hashEmail(email = "") {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
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

  const email = input.email || null;
  const emailHash = email ? hashEmail(email) : null;

  const sessionType = input.session_type || "initial";
  const tolerance = input.tolerance_and_capacity || "";
  const intensity = input.symptom_intensity || "";

  /* -----------------------------
     LOAD EXISTING JOURNEY (IF ANY)
  ------------------------------*/
  let journey = null;

  if (emailHash) {
    const { data } = await supabase
      .from("ai_journey")
      .select("*")
      .eq("email_hash", emailHash)
      .single();

    journey = data || null;
  }

  /* -----------------------------
     STATE LOGIC (STABLE + FINAL)
  ------------------------------*/
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

  /* -----------------------------
     SAFETY FLAGS
  ------------------------------*/
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

  /* -----------------------------
     SYSTEM PROMPT (LOCKED)
  ------------------------------*/
  const systemPrompt = `
You are the Whole Body Reset AI Guide.

NON-NEGOTIABLE RULES
- Educational support only
- No diagnosing, treating, curing
- Never replace or adjust medications
- No medical claims or urgency

SESSION TYPE: ${sessionType}
CURRENT STATE: ${output_state}

PLAN CONTINUITY
If a previous plan exists:
- MODIFY it
- Do NOT replace it
- Make SMALL, targeted changes only

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
Include:
- next_check_in.timing
- next_check_in.what_to_watch
- next_check_in.check_in_earlier_if

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

  /* -----------------------------
     USER PROMPT
  ------------------------------*/
  const userPrompt = `
SYMPTOMS: ${input.current_symptoms || input.new_symptoms || "not provided"}
PROGRESS: ${input.overall_progress || "not provided"}
TOLERANCE: ${tolerance}
CHANGES MADE: ${input.changes_made || "not provided"}
GOALS: ${input.goals || "not provided"}

SAFETY FLAGS:
${JSON.stringify(flags, null, 2)}

PREVIOUS PLAN (MODIFY ONLY):
${journey?.last_plan ? JSON.stringify(journey.last_plan, null, 2) : "None"}
`;

  /* -----------------------------
     AI CALL
  ------------------------------*/
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

  /* -----------------------------
     SAVE / UPDATE JOURNEY
  ------------------------------*/
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

  /* -----------------------------
     RETURN TO FRONTEND
  ------------------------------*/
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

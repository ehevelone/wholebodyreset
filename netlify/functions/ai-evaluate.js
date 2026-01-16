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
  const hasMeds = !!input.current_meds;

  let journey = null;
  if (emailHash) {
    const { data } = await supabase
      .from("ai_journey")
      .select("*")
      .eq("email_hash", emailHash)
      .single();
    journey = data || null;
  }

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

  const systemPrompt = `
You are the Whole Body Reset AI Guide.

NON-NEGOTIABLE RULES
- Educational support only
- No diagnosing, treating, curing
- Never replace or adjust medications
- No medical claims or urgency

PROGRAM FRAME (NON-NEGOTIABLE)

All guidance MUST follow the Whole Body Reset sequence:

1. Hydration and mineral balance come first
2. Gentle drainage support (bowels, lymph, circulation) comes next
3. Organ support is introduced only if tolerance allows
4. Aggressive detox is never used
5. Pacing always overrides speed

If symptoms are intense or tolerance is low:
- Focus on hydration, stabilization, rest
- Do NOT layer multiple supports
- Avoid introducing organ support

If symptoms are mild and tolerance is stable:
- Support gentle drainage
- Introduce light organ support only if clearly appropriate

Every plan must clearly reflect where the user is in this sequence,
even if not explicitly named.

SESSION TYPE: ${sessionType}
CURRENT STATE: ${output_state}

PLAN CONTINUITY
If a previous plan exists:
- MODIFY it
- Do NOT replace it
- Make SMALL, targeted changes only

MEDICATION CONTEXT (ALLOWED LANGUAGE)
If the user listed medications, you MAY include ONE sentence in reflection:
"This plan is designed to work alongside existing care and does not suggest changes to medications. If questions arise over time, those discussions belong with your provider."

Do NOT name medications.
Do NOT give instructions.
Do NOT mention timing or stopping.

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

  const userPrompt = `
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

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

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

/* -----------------------------
   SAFETY DISCLAIMER (always)
------------------------------ */
const DISCLAIMER =
  "Educational content only. Not medical advice. Do not stop or change medications. If symptoms are severe, worsening, or you feel unsafe, seek urgent medical care and contact your clinician.";

/* -----------------------------
   Helpers
------------------------------ */
function extractFirstJSONObject(text = "") {
  // Attempts to pull the first JSON object from the model output
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  return slice;
}

function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function nowISO() {
  return new Date().toISOString();
}

/* -----------------------------
   Pass 1: ANALYZE (silent)
------------------------------ */
const analysisSystemPrompt = `
You are the Whole Body Reset system analyst.

Goal:
- Read the user input and decide if we have enough information to proceed safely.
- Do NOT give a plan.
- Do NOT give medical advice.
- Output ONLY strict JSON.

Return JSON with EXACT keys:
{
  "proceed": true|false,
  "needs_followup": true|false,
  "followup_reason": "string",
  "followup_questions": ["string", "..."],
  "risk_level": "low"|"moderate"|"elevated",
  "notes_for_generator": "string"
}

Rules:
- If user seems very sensitive / overwhelmed / unsure, treat as "elevated" or "moderate" and prefer followup.
- If key info is missing for pacing (tolerance, intensity, meds/conditions, stress response), ask followups.
- followup_questions should be 1–4 short questions max.
- Output MUST be valid JSON only.
`.trim();

/* -----------------------------
   Pass 2: GENERATE PLAN (user-facing)
   Must match UI expectation:
   { state, plan, disclaimer }
------------------------------ */
const planSystemPrompt = `
You are the Whole Body Reset AI Guide.

You MUST:
- Be practical, human, and time-bound.
- Never diagnose.
- Never tell the user to stop or change medications.
- If medications exist, acknowledge and advise continuing as prescribed.
- Use gentle pacing language.
- Return ONLY valid JSON in the required structure.
- No markdown. No extra text. JSON only.

Required JSON structure:
{
  "state": "success",
  "plan": {
    "focus_today": "string",
    "plan_overview": "string",
    "dominant_driver": "string",
    "medication_context": "string",
    "day_1_2": { "goal": "string", "actions": ["..."] },
    "day_3_4": { "goal": "string", "actions": ["..."] },
    "after_day_4": { "goal": "string", "actions": ["..."] },
    "food_support": ["..."],
    "hydration_and_movement": ["..."],
    "mechanical_support": ["..."],
    "supplements": [
      { "name": "string", "how_to_take": "string" }
    ],
    "what_to_expect": ["..."],
    "red_flags_stop": ["..."],
    "next_check_in": {
      "timing": "string",
      "what_to_watch": ["..."]
    }
  },
  "disclaimer": "string"
}

Rules:
- If you are unsure, keep actions minimal and conservative.
- supplements can be empty [] if not appropriate.
- disclaimer must be included (use the provided disclaimer text).
`.trim();

function looksValidPlan(parsed) {
  return (
    parsed?.plan &&
    parsed?.state &&
    parsed?.plan?.day_1_2?.actions?.length >= 1 &&
    parsed?.plan?.day_3_4?.actions?.length >= 1 &&
    typeof parsed?.disclaimer === "string" &&
    parsed.disclaimer.length > 0
  );
}

/* ======================================================
   NETLIFY FUNCTION
   ====================================================== */
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "error", message: "Invalid request." })
    };
  }

  const { type, payload } = input || {};

  if (!type || !payload) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "error", message: "Invalid request." })
    };
  }

  // Email can be missing on intake/check-in pages depending on how UI is wired.
  // We try a few places. If still missing, we return a helpful clarification.
  const email =
    payload.email ||
    input.email ||
    payload.user_email ||
    payload.customer_email ||
    null;

  if (!email) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason:
            "We need your email to continue so we can load your saved journey.",
          questions: [
            "Please go back to the start page and re-enter your email, then continue."
          ]
        },
        disclaimer: DISCLAIMER
      })
    };
  }

  const email_hash = hashEmail(email);

  // Load journey if present
  const { data: journey } = await supabase
    .from("ai_journey")
    .select("*")
    .eq("email_hash", email_hash)
    .maybeSingle();

  // Build a single “context packet” for the AI passes
  const contextPacket = {
    user_type: journey ? "returning" : "new",
    session_count: journey?.session_count || 0,
    current_state: journey?.current_state || "none",
    last_plan: journey?.last_plan || null,
    input_type: type,
    current_input: payload
  };

  /* -----------------------------
     PASS 1: ANALYZE
  ------------------------------ */
  let analysis = null;

  for (let i = 0; i < 2; i++) {
    try {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: analysisSystemPrompt },
          {
            role: "user",
            content: JSON.stringify(contextPacket, null, 2)
          }
        ]
      });

      const raw = ai?.choices?.[0]?.message?.content || "";
      const jsonSlice = extractFirstJSONObject(raw) || raw;
      analysis = safeJSONParse(jsonSlice);

      if (
        analysis &&
        typeof analysis.proceed === "boolean" &&
        typeof analysis.needs_followup === "boolean" &&
        Array.isArray(analysis.followup_questions)
      ) {
        break;
      }

      analysis = null;
    } catch (e) {
      analysis = null;
    }
  }

  // If analysis failed, do a safe fallback (ask a small followup)
  if (!analysis) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason:
            "Before we generate a plan, we need a little more clarity to pace this safely.",
          questions: [
            "How intense do your symptoms feel right now (mild / moderate / intense)?",
            "How would you describe your tolerance (sensitive / stable / not sure)?"
          ]
        },
        disclaimer: DISCLAIMER
      })
    };
  }

  // If AI says we need more info, return followups (NO plan yet)
  if (analysis.needs_followup || analysis.proceed === false) {
    // Update / insert journey so returning logic stays consistent
    if (journey) {
      await supabase
        .from("ai_journey")
        .update({
          current_state: "clarification_needed",
          session_count: (journey.session_count || 0) + 1,
          last_checkin_at: nowISO(),
          // Optional: store last analysis notes
          last_plan: journey.last_plan || null
        })
        .eq("id", journey.id);
    } else {
      await supabase.from("ai_journey").insert({
        email,
        email_hash,
        current_state: "clarification_needed",
        last_plan: null,
        session_count: 1,
        last_checkin_at: nowISO()
      });
    }

    const questions =
      analysis.followup_questions && analysis.followup_questions.length
        ? analysis.followup_questions.slice(0, 4)
        : [
            "What feels better, worse, or different since your last step?",
            "How sensitive do you feel right now to changes (sensitive / stable / not sure)?"
          ];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason:
            analysis.followup_reason ||
            "We need a little more information before generating a plan.",
          questions
        },
        disclaimer: DISCLAIMER
      })
    };
  }

  /* -----------------------------
     PASS 2: GENERATE PLAN
  ------------------------------ */
  const generatorPacket = {
    ...contextPacket,
    analysis_summary: {
      risk_level: analysis.risk_level || "moderate",
      notes_for_generator: analysis.notes_for_generator || ""
    },
    required_disclaimer: DISCLAIMER
  };

  let parsed = null;

  for (let i = 0; i < 3; i++) {
    try {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.35,
        messages: [
          { role: "system", content: planSystemPrompt },
          { role: "user", content: JSON.stringify(generatorPacket, null, 2) }
        ]
      });

      const raw = ai?.choices?.[0]?.message?.content || "";
      const jsonSlice = extractFirstJSONObject(raw) || raw;

      parsed = safeJSONParse(jsonSlice);

      // Force disclaimer if missing
      if (parsed && !parsed.disclaimer) parsed.disclaimer = DISCLAIMER;

      if (looksValidPlan(parsed)) break;
      parsed = null;
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: "error",
        message: "AI failed to generate a valid plan.",
        disclaimer: DISCLAIMER
      })
    };
  }

  /* -----------------------------
     SAVE JOURNEY
  ------------------------------ */
  if (journey) {
    await supabase
      .from("ai_journey")
      .update({
        current_state: parsed.state,
        last_plan: parsed.plan,
        session_count: (journey.session_count || 0) + 1,
        last_checkin_at: nowISO()
      })
      .eq("id", journey.id);
  } else {
    await supabase.from("ai_journey").insert({
      email,
      email_hash,
      current_state: parsed.state,
      last_plan: parsed.plan,
      session_count: 1,
      last_checkin_at: nowISO()
    });
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

import OpenAI from "openai";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

/* ======================================================
   ENV + CLIENTS
====================================================== */

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/* ======================================================
   HELPERS
====================================================== */

function hashEmail(email = "") {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

function extractFirstJSONObject(text = "") {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
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

/* ======================================================
   CONSTANTS
====================================================== */

const DISCLAIMER =
  "Educational content only. Not medical advice. Do not stop or change medications. If symptoms are severe, worsening, or you feel unsafe, seek urgent medical care and contact your clinician.";

/* ======================================================
   SYSTEM PROMPTS
====================================================== */

const analysisSystemPrompt = `
You are the Whole Body Reset system analyst.

Goal:
- Decide if enough info exists to proceed safely.
- Do NOT give a plan.
- Do NOT give medical advice.
- Output ONLY strict JSON.

Return JSON EXACTLY:
{
  "proceed": true|false,
  "needs_followup": true|false,
  "followup_reason": "string",
  "followup_questions": ["string"],
  "risk_level": "low"|"moderate"|"elevated",
  "notes_for_generator": "string"
}
`.trim();

const planSystemPrompt = `
You are the Whole Body Reset AI Guide.

Rules:
- Be practical, human, time-bound
- Never diagnose
- Never change medications
- Gentle pacing only
- JSON ONLY

Required JSON:
{
  "state": "success",
  "plan": {
    "focus_today": "string",
    "plan_overview": "string",
    "dominant_driver": "string",
    "medication_context": "string",
    "day_1_2": { "goal": "string", "actions": ["string"] },
    "day_3_4": { "goal": "string", "actions": ["string"] },
    "after_day_4": { "goal": "string", "actions": ["string"] },
    "food_support": ["string"],
    "hydration_and_movement": ["string"],
    "mechanical_support": ["string"],
    "supplements": [{ "name": "string", "how_to_take": "string" }],
    "what_to_expect": ["string"],
    "red_flags_stop": ["string"],
    "next_check_in": {
      "timing": "string",
      "what_to_watch": ["string"]
    }
  },
  "disclaimer": "string"
}
`.trim();

function looksValidPlan(parsed) {
  return (
    parsed?.state === "success" &&
    parsed?.plan?.day_1_2?.actions?.length >= 1 &&
    parsed?.plan?.day_3_4?.actions?.length >= 1 &&
    typeof parsed?.disclaimer === "string"
  );
}

/* ======================================================
   NETLIFY FUNCTION
====================================================== */

export async function handler(event) {
  console.log("AI-EVALUATE START");

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ state: "error", message: "Invalid request." })
    };
  }

  const { type, payload } = input || {};

  const email =
    payload?.email ||
    input?.email ||
    payload?.user_email ||
    payload?.customer_email ||
    null;

  console.log("AI-EVALUATE INPUT:", {
    type,
    email,
    payload_keys: Object.keys(payload || {})
  });

  if (!type || !payload || !email) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason: "We need your email to continue.",
          questions: [
            "Please return to the start page and re-enter your email."
          ]
        },
        disclaimer: DISCLAIMER
      })
    };
  }

  const email_hash = hashEmail(email);

  /* ======================================================
     ENSURE SUPABASE ROW EXISTS FIRST
  ====================================================== */

  const { data: existing } = await supabase
    .from("ai_journey")
    .select("*")
    .eq("email_hash", email_hash)
    .maybeSingle();

  let journey = existing;

  if (!journey) {
    const { data: inserted, error } = await supabase
      .from("ai_journey")
      .insert({
        email,
        email_hash,
        current_state: "started",
        last_plan: null,
        session_count: 0,
        last_checkin_at: nowISO()
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Supabase insert failed", error);
      return {
        statusCode: 200,
        body: JSON.stringify({
          state: "error",
          message: "Unable to start session.",
          disclaimer: DISCLAIMER
        })
      };
    }

    journey = inserted;
  }

  const contextPacket = {
    user_type: journey.session_count > 0 ? "returning" : "new",
    session_count: journey.session_count,
    current_state: journey.current_state,
    last_plan: journey.last_plan,
    input_type: type,
    current_input: payload
  };

  /* ======================================================
     PASS 1 — ANALYSIS
  ====================================================== */

  console.log("AI ANALYSIS → sending to OpenAI");

  let analysis = null;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: analysisSystemPrompt },
        { role: "user", content: JSON.stringify(contextPacket, null, 2) }
      ]
    });

    const raw = ai.choices[0].message.content;
    analysis = safeJSONParse(extractFirstJSONObject(raw) || raw);
  } catch (e) {
    console.error("AI ANALYSIS ERROR:", e);
  }

  if (!analysis || analysis.needs_followup || analysis.proceed === false) {
    await supabase
      .from("ai_journey")
      .update({
        current_state: "clarification_needed",
        last_checkin_at: nowISO()
      })
      .eq("id", journey.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        state: "clarification_needed",
        clarification: {
          reason:
            analysis?.followup_reason ||
            "We need a bit more information before continuing.",
          questions:
            analysis?.followup_questions || [
              "How intense do your symptoms feel right now?",
              "How sensitive do you feel to changes?"
            ]
        },
        disclaimer: DISCLAIMER
      })
    };
  }

  /* ======================================================
     PASS 2 — GENERATE PLAN
  ====================================================== */

  console.log("AI GENERATION → sending to OpenAI");

  let plan = null;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: planSystemPrompt },
        {
          role: "user",
          content: JSON.stringify(
            {
              ...contextPacket,
              analysis_summary: analysis,
              required_disclaimer: DISCLAIMER
            },
            null,
            2
          )
        }
      ]
    });

    const raw = ai.choices[0].message.content;
    plan = safeJSONParse(extractFirstJSONObject(raw) || raw);
    if (plan && !plan.disclaimer) plan.disclaimer = DISCLAIMER;
  } catch (e) {
    console.error("AI GENERATION ERROR:", e);
  }

  if (!looksValidPlan(plan)) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        state: "error",
        message: "AI failed to generate a valid plan.",
        disclaimer: DISCLAIMER
      })
    };
  }

  /* ======================================================
     SAVE FINAL RESULT
  ====================================================== */

  await supabase
    .from("ai_journey")
    .update({
      current_state: "success",
      last_plan: plan.plan,
      session_count: journey.session_count + 1,
      last_checkin_at: nowISO()
    })
    .eq("id", journey.id);

  console.log("AI-EVALUATE COMPLETE");

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan)
  };
}

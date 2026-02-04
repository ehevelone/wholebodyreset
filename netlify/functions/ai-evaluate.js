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

/* ======================================================
   PLAN VALIDATION
====================================================== */

function looksValidPlan(parsed) {
  if (!parsed || parsed.state !== "success") return false;
  if (!parsed.plan) return false;

  const blocks = [
    parsed.plan.day_1_2,
    parsed.plan.day_3_4,
    parsed.plan.after_day_4
  ];

  return blocks.some(
    b => Array.isArray(b?.actions) && b.actions.length > 0
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
     ENSURE JOURNEY EXISTS
  ====================================================== */

  const { data: existing } = await supabase
    .from("ai_journey")
    .select("*")
    .eq("email_hash", email_hash)
    .maybeSingle();

  let journey = existing;

  if (!journey) {
    const { data: inserted } = await supabase
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

  let analysis = null;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini", // ✅ FIX
      temperature: 0.2,
      messages: [
        { role: "system", content: analysisSystemPrompt },
        { role: "user", content: JSON.stringify(contextPacket, null, 2) }
      ]
    });

    const raw = ai.choices[0].message.content;
    analysis = safeJSONParse(extractFirstJSONObject(raw) || raw);
  } catch {}

  /* ======================================================
     PASS 2 — GENERATE PLAN
  ====================================================== */

  let plan = null;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1-mini", // ✅ FIX
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
    if (plan && !plan.state) plan.state = "success";
  } catch {}

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

  await supabase
    .from("ai_journey")
    .update({
      current_state: "success",
      last_plan: plan.plan,
      session_count: journey.session_count + 1,
      last_checkin_at: nowISO()
    })
    .eq("id", journey.id);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan)
  };
}

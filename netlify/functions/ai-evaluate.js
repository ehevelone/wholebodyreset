import OpenAI from "openai";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

/* ======================================================
   CLIENTS
====================================================== */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function nowISO() {
  return new Date().toISOString();
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ======================================================
   CONSTANTS
====================================================== */

const DISCLAIMER =
  "Educational content only. Not medical advice. Do not stop or change medications. If symptoms are severe, worsening, or you feel unsafe, seek urgent medical care and contact your clinician.";

/* ======================================================
   PROMPTS (UNCHANGED)
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
  "proceed": true,
  "needs_followup": false,
  "risk_level": "low",
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
    "after_day_4": { "goal": "string", "actions": ["string"] }
  },
  "disclaimer": "string"
}
`.trim();

/* ======================================================
   NETLIFY FUNCTION
====================================================== */

export async function handler(event) {
  console.log("AI-EVALUATE START");

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const input = JSON.parse(event.body || "{}");
  const { type, payload } = input;

  const email =
    payload?.email ||
    input?.email ||
    payload?.user_email ||
    payload?.customer_email;

  if (!type || !payload || !email) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        state: "clarification_needed",
        disclaimer: DISCLAIMER
      })
    };
  }

  const email_hash = hashEmail(email);

  const { data: existing } = await supabase
    .from("ai_journey")
    .select("*")
    .eq("email_hash", email_hash)
    .maybeSingle();

  const journey =
    existing ||
    (
      await supabase
        .from("ai_journey")
        .insert({
          email,
          email_hash,
          current_state: "started",
          session_count: 0,
          last_checkin_at: nowISO()
        })
        .select()
        .single()
    ).data;

  const contextPacket = {
    user_type: journey.session_count > 0 ? "returning" : "new",
    input_type: type,
    current_input: payload
  };

  /* ======================================================
     PASS 1 — ANALYSIS (JSON FORCED)
  ====================================================== */

  const analysisResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    text: { format: { type: "json_object" } },
    input: [
      { role: "system", content: analysisSystemPrompt },
      { role: "user", content: JSON.stringify(contextPacket) }
    ]
  });

  const analysis = safeParseJSON(analysisResponse.output_text) || {
    proceed: true
  };

  /* ======================================================
     PASS 2 — PLAN GENERATION (JSON FORCED)
  ====================================================== */

  const planResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    text: { format: { type: "json_object" } },
    input: [
      { role: "system", content: planSystemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          ...contextPacket,
          analysis_summary: analysis,
          required_disclaimer: DISCLAIMER
        })
      }
    ]
  });

  const plan = safeParseJSON(planResponse.output_text);

  if (!plan || !plan.plan) {
    console.error("PLAN PARSE FAILED:", planResponse.output_text);
    return {
      statusCode: 200,
      body: JSON.stringify({
        state: "error",
        message: "AI returned invalid plan structure.",
        disclaimer: DISCLAIMER
      })
    };
  }

  plan.state ||= "success";
  plan.disclaimer ||= DISCLAIMER;

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

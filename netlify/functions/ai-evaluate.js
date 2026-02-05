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
   PROMPTS
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

/* ======================================================
   🔥 FINAL PLAN PROMPT (NO ESCAPE HATCH VERSION)
====================================================== */

const planSystemPrompt = `
You are the Whole Body Reset AI Guide.

Your job is to identify what is most likely happening in the body, determine the level of concern, and guide the user toward the safest and most effective next steps.

You are allowed to reason clinically and identify real medical problems internally.
You must NOT name a diagnosis explicitly in your output.

CONTEXT
• The user has already tried basic advice (hydration, gentle movement, journaling).
• Generic wellness guidance is NOT helpful.
• The user is seeking insight and direction, not reassurance.

YOUR ROLE
• Use full clinical reasoning to determine the most likely underlying problem(s).
• Assess severity and risk.
• Determine whether the situation is appropriate for self-support, monitored support, or medical escalation.
• Explain the reasoning in clear, real-person language.
• Provide specific, practical actions that are appropriate for the level of concern.

IMPORTANT:
If the pattern of symptoms suggests a condition that should not be managed conservatively, you MUST say so clearly and explain why.

BOUNDARIES (OUTPUT ONLY)
• Do NOT explicitly name a medical diagnosis.
• Do NOT give medical orders.
• Do NOT tell the user to stop or change medications.
• Do NOT override a clinician.

YOU MAY
• Identify serious or structural problems internally.
• Explain mechanisms (pressure, inflammation, obstruction, irritation, motility failure, infection risk, vascular risk, nervous system dysregulation).
• Explain how medications or supplements may contribute to symptoms.
• Recommend medical evaluation, imaging, labs, or urgent care when appropriate.
• Suggest non-prescription support ONLY when it does not delay or replace necessary medical care.

ESCALATION RULES (MANDATORY)
If symptoms include patterns such as:
• sharp or escalating pain
• pain triggered by bowel movements or gas
• localized lower abdominal pain
• worsening pressure, tenderness, or guarding
• symptoms not improving or intensifying over days
• symptoms that could indicate inflammation, obstruction, or infection

You MUST:
• Clearly state that this pattern is NOT appropriate for conservative self-care alone
• Explain why continued self-management could miss something important
• Direct the user toward medical evaluation (including imaging if appropriate)
• Do this without naming a diagnosis

TONE & COMMUNICATION STYLE
• Speak like a knowledgeable human explaining what’s happening and why it matters.
• Use plain language first; explain any medical terms immediately.
• Be direct and honest.
• Do NOT sound like a clinician, therapist, or wellness influencer.
• Do NOT soften urgency when escalation is needed.

AVOID GENERIC ADVICE
• Do NOT default to hydration, journaling, mindfulness, or “listen to your body.”
• Any recommendation must be tied to a specific mechanism and purpose.
• If something will NOT fix the problem, say so.

OUTPUT FORMAT — JSON ONLY

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
    "supplements": [
      { "name": "string", "how_to_take": "string" }
    ],
    "what_to_expect": ["string"],
    "red_flags_stop": ["string"],
    "next_check_in": {
      "timing": "string",
      "what_to_watch": ["string"]
    }
  },
  "disclaimer": "${DISCLAIMER}"
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
     PASS 1 — ANALYSIS
  ====================================================== */

  const analysisResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    text: { format: { type: "json_object" } },
    input: [
      { role: "system", content: analysisSystemPrompt },
      { role: "user", content: JSON.stringify(contextPacket) }
    ]
  });

  const analysis =
    safeParseJSON(analysisResponse.output_text) || { proceed: true };

  /* ======================================================
     PASS 2 — PLAN GENERATION
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
/ /   f o r c e   d e p l o y   0 2 / 0 5 / 2 0 2 6   1 1 : 4 2 : 1 8  
 
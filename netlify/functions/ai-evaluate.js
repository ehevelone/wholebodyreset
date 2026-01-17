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

  const isVague =
    (!input.current_symptoms || input.current_symptoms.trim().length < 40) ||
    (!intensity && !tolerance);

  /* ============================
     GUIDED USER CHECK
  ============================ */
  if (email) {
    const { data } = await supabase
      .from("guided_users")
      .select("id")
      .eq("email", email)
      .single();

    if (data && entryContext === "foundation") {
      entryContext = "os_escalation";
    }
  }

  /* ============================
     LOAD JOURNEY
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
     SYSTEM PROMPT
  ============================ */
  const systemPrompt = `
You are the Whole Body Reset AI Guide.

NON-NEGOTIABLE RULES
- Educational support only
- No diagnosing or treating
- Never change medications
- No urgency language

PROGRAM RULES
- Foundations assumed
- No aggressive detox
- Pacing overrides speed

ENTRY CONTEXT: ${entryContext}

If input is vague:
- DO NOT generate a plan
- Return clarification_needed
- Ask 4–6 questions focused on load, reactions, timing

OUTPUT FORMAT (STRICT JSON ONLY)
`;

  /* ============================
     USER PROMPT
  ============================ */
  const userPrompt = `
SYMPTOMS: ${input.current_symptoms || "not provided"}
TOLERANCE: ${tolerance}
INTENSITY: ${intensity}
GOALS: ${input.goals || "not provided"}
VAGUE INPUT: ${isVague}
`;

  /* ============================
     AI CALL (SAFE)
  ============================ */
  let raw = "";
  let parsed = null;

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    raw = aiResponse.choices[0].message.content;
    parsed = JSON.parse(raw);

  } catch (err) {
    console.error("AI PARSE FAILURE — FALLING BACK");

    parsed = {
      state: "clarification_needed",
      clarification: {
        reason:
          "We need a bit more detail to safely tailor guidance.",
        questions: [
          "What changed most recently before symptoms appeared?",
          "What reactions occur after meals or supplements?",
          "Are symptoms constant or do they fluctuate during the day?",
          "What have you already tried that made things worse?",
          "What feels easiest on your system right now?"
        ]
      },
      disclaimer: "Educational support only. Not medical advice."
    };
  }

  /* ============================
     SAVE JOURNEY (PLANS ONLY)
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

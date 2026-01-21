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

const systemPrompt = `
You are the Whole Body Reset AI Guide.

Generate a practical, human, time-bound plan.
Do not diagnose or change medications.
Acknowledge medications and advise continuation as prescribed.

Return ONLY valid JSON in the approved structure.
`;

function looksValid(parsed) {
  return (
    parsed?.plan &&
    parsed?.state &&
    parsed?.plan?.day_1_2?.actions?.length &&
    parsed?.plan?.day_3_4?.actions?.length &&
    parsed?.disclaimer
  );
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const input = JSON.parse(event.body || "{}");
  const { type, payload } = input;

  if (!type || !payload) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request" })
    };
  }

  if (!payload.email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Email missing" })
    };
  }

  const email = payload.email;
  const email_hash = hashEmail(email);

  const { data: journey } = await supabase
    .from("ai_journey")
    .select("*")
    .eq("email_hash", email_hash)
    .maybeSingle();

  const userPrompt = `
USER TYPE: ${journey ? "Returning" : "New"}
Sessions so far: ${journey?.session_count || 0}
Current state: ${journey?.current_state || "none"}

Previous plan:
${journey?.last_plan ? JSON.stringify(journey.last_plan) : "None"}

CURRENT INPUT:
${JSON.stringify(payload, null, 2)}
`;

  let parsed = null;

  for (let i = 0; i < 3; i++) {
    try {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.35,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      parsed = JSON.parse(ai.choices[0].message.content);
      if (looksValid(parsed)) break;
      parsed = null;
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        state: "error",
        message: "AI failed to generate a valid plan."
      })
    };
  }

  if (journey) {
    await supabase.from("ai_journey").update({
      current_state: parsed.state,
      last_plan: parsed.plan,
      session_count: journey.session_count + 1,
      last_checkin_at: new Date().toISOString()
    }).eq("id", journey.id);
  } else {
    await supabase.from("ai_journey").insert({
      email,
      email_hash,
      current_state: parsed.state,
      last_plan: parsed.plan,
      session_count: 1,
      last_checkin_at: new Date().toISOString()
    });
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed)
  };
}

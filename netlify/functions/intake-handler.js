import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const { email, first_name } = JSON.parse(event.body || "{}");

  if (!email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Email required" })
    };
  }

  const email_hash = hashEmail(email);

  // Ensure user exists (idempotent)
  await supabase.from("users").upsert({
    email,
    email_hash,
    first_name: first_name || null,
    updated_at: new Date().toISOString()
  });

  // Check for existing journey
  const { data: journey } = await supabase
    .from("ai_journey")
    .select("id")
    .eq("email_hash", email_hash)
    .maybeSingle();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route: journey ? "check-in" : "intake"
    })
  };
}

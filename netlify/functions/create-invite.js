import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const { email } = JSON.parse(event.body || "{}");
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const expires = new Date();
  expires.setDate(expires.getDate() + 1); // 24h window

  const { error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "pending",
        invite_token_hash: tokenHash,
        invite_expires_at: expires.toISOString()
      },
      { onConflict: "email" }
    );

  if (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      link: `${process.env.SITE_URL}/gift/?k=${token}`
    })
  };
}

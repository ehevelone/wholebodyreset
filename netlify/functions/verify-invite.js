import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const { token } = JSON.parse(event.body || "{}");
    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ ok: false }) };
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const { data: user, error } = await supabase
      .from("guided_users")
      .select("*")
      .eq("invite_token_hash", tokenHash)
      .gt("invite_expires_at", new Date().toISOString())
      .single();

    if (error || !user) {
      return { statusCode: 200, body: JSON.stringify({ ok: false }) };
    }

    // clear invite token so it cannot be reused
    await supabase
      .from("guided_users")
      .update({
        invite_token_hash: null,
        invite_expires_at: null
      })
      .eq("id", user.id);

    // 🔔 TRIGGER EMAIL ENGINE (CORRECT WAY)
    await fetch(`${process.env.SITE_URL}/.netlify/functions/send_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        redirect: "/intake/intake-start.html"
      })
    };

  } catch (e) {
    console.error("verify-invite error:", e);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
}

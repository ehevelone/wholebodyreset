import crypto from "crypto";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// HARD-CODED = SAME AS POWERSHELL
const REGISTER_URL =
  "https://wholebodyreset.life/.netlify/functions/create-guided-user";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const { token } = JSON.parse(event.body || "{}");
    if (!token) {
      return { statusCode: 400, body: "Missing token" };
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const { data: user, error } = await supabase
      .from("guided_users")
      .select("id,email")
      .eq("invite_token_hash", tokenHash)
      .gt("invite_expires_at", new Date().toISOString())
      .single();

    if (error || !user) {
      return { statusCode: 200, body: JSON.stringify({ ok: false }) };
    }

    // Clear token so it cannot be reused
    await supabase
      .from("guided_users")
      .update({
        invite_token_hash: null,
        invite_expires_at: null
      })
      .eq("id", user.id);

    // 🔑 EXACT SAME POST AS BACKDOOR
    await fetch(REGISTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        source: "invite"
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        redirect: "/intake/intake-start.html"
      })
    };

  } catch (err) {
    console.error("verify-invite failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false })
    };
  }
}

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { registerUser } from "./_lib/registerUser.js";

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
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false })
      };
    }

    await supabase
      .from("guided_users")
      .update({
        invite_token_hash: null,
        invite_expires_at: null
      })
      .eq("id", user.id);

    await registerUser({
      email: user.email,
      source: "invite",
      forceWelcome: true
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

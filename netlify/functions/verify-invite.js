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

  const { token } = JSON.parse(event.body || "{}");
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) };
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { data: user, error } = await supabase
    .from("guided_users")
    .select("*")
    .eq("invite_token_hash", tokenHash)
    .single();

  if (
    error ||
    !user ||
    !user.invite_expires_at ||
    new Date(user.invite_expires_at) < new Date()
  ) {
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }

  // Activate user (Stripe-equivalent moment)
  await supabase
    .from("guided_users")
    .update({
      status: "active",
      invite_token_hash: null,
      invite_expires_at: null,
      current_email: "hd-01-welcome.html",
      current_module: "hydration"
    })
    .eq("id", user.id);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      user_id: user.id,
      email: user.email
    })
  };
}

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

  try {
    const { token } = JSON.parse(event.body || "{}");
    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ ok: false }) };
    }

    // hash incoming token
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // lookup invite
    const { data: invite, error } = await supabase
      .from("invites")
      .select("*")
      .eq("token_hash", tokenHash)
      .single();

    if (
      error ||
      !invite ||
      invite.uses >= invite.max_uses ||
      new Date(invite.expires_at) < new Date()
    ) {
      return { statusCode: 200, body: JSON.stringify({ ok: false }) };
    }

    const email = invite.email;

    // STRIPE-EQUIVALENT STEP:
    // create or reuse canonical guided user
    const { data: userRows, error: userErr } = await supabase
      .from("guided_users")
      .upsert(
        {
          email,
          program: "guided_foundations",
          status: "active",
          current_email: "hd-01-welcome.html",
          current_module: "hydration"
        },
        { onConflict: "email" }
      )
      .select();

    if (userErr || !userRows || !userRows[0]) {
      console.error(userErr);
      return { statusCode: 500, body: JSON.stringify({ ok: false }) };
    }

    const user = userRows[0];

    // mark invite as used
    await supabase
      .from("invites")
      .update({ uses: invite.uses + 1 })
      .eq("id", invite.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        user_id: user.id,
        email: user.email
      })
    };

  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
}

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { registerUser } = require("./registerUser.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async function (event) {
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

    // 🔍 Find invited user
    const { data: user, error } = await supabase
      .from("guided_users")
      .select("id,email")
      .eq("invite_token_hash", tokenHash)
      .gt("invite_expires_at", new Date().toISOString())
      .single();

    if (error || !user) {
      return { statusCode: 200, body: JSON.stringify({ ok: false }) };
    }

    // 🔓 Clear invite token
    await supabase
      .from("guided_users")
      .update({
        invite_token_hash: null,
        invite_expires_at: null
      })
      .eq("id", user.id);

    // 🚀 START PROGRAM (THIS INSERTS ROW + SENDS EMAIL)
    await registerUser({ email: user.email });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        redirect: "/intake/intake-start.html"
      })
    };

  } catch (err) {
    console.error("verify-invite error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false })
    };
  }
};

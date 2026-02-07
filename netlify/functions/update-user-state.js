// netlify/functions/update-user-state.js
// ⚠️ DOES NOT CONTROL EMAIL PROGRESSION

const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const body = JSON.parse(event.body || "{}");
  const { user_id, updates } = body;

  if (!user_id || !updates) {
    return { statusCode: 400, body: "Missing payload" };
  }

  // 🚫 HARD BLOCK progression fields
  delete updates.current_email;
  delete updates.last_sent_at;
  delete updates.next_email_at;
  delete updates.awaiting_input;

  const { error } = await supabase
    .from("guided_users")
    .update(updates)
    .eq("id", user_id);

  if (error) {
    console.error("❌ UPDATE USER STATE ERROR:", error);
    return { statusCode: 500, body: "Update failed" };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};

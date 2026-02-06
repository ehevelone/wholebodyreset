import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { email, response } = payload;

  if (!email || !response) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing email or response" })
    };
  }

  if (!["better", "same", "worse"].includes(response)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid response value" })
    };
  }

  // 🔎 Load user
  const { data: user, error } = await supabase
    .from("guided_users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !user) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "User not found" })
    };
  }

  // ⛔ Ignore clicks if we're not waiting for input
  if (user.awaiting_input !== true) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ignored: true })
    };
  }

  // 🎯 Map response → system state
  let user_state = user.user_state;

  if (response === "better") user_state = "bt";
  if (response === "same") user_state = "nc";
  if (response === "worse") user_state = "os";

  const now = new Date().toISOString();

  // ✅ Unlock dispatcher + save response
  await supabase
    .from("guided_users")
    .update({
      user_state,
      last_user_response: response,
      awaiting_input: false,
      next_email_at: now
    })
    .eq("id", user.id);

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      email,
      response,
      user_state
    })
  };
}

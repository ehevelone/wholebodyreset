import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const addMinutesISO = m => new Date(Date.now() + m * 60000).toISOString();

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
    return { statusCode: 400, body: "Missing email or response" };
  }

  if (!["better", "same", "worse"].includes(response)) {
    return { statusCode: 400, body: "Invalid response value" };
  }

  const { data: user, error } = await supabase
    .from("guided_users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !user) {
    return { statusCode: 404, body: "User not found" };
  }

  if (user.awaiting_input !== true) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ignored: true })
    };
  }

  let user_state = "nc";
  if (response === "better") user_state = "bt";
  if (response === "worse") user_state = "os";

  const { error: updateErr, data: updated } = await supabase
    .from("guided_users")
    .update({
      user_state,
      last_user_response: response,
      awaiting_input: false,
      next_email_at: addMinutesISO(5)
    })
    .eq("id", user.id)
    .select("id,email,current_email,awaiting_input,next_email_at,user_state,last_user_response");

  if (updateErr) {
    console.error("USER RESPONSE UPDATE FAILED:", updateErr);
    return { statusCode: 500, body: "Update failed" };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      email,
      response,
      user_state,
      updated: updated?.[0] || null
    })
  };
}

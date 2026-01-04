import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const { user_id, user_state } = JSON.parse(event.body || "{}");

  if (!user_id || !user_state) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing user_id or user_state" })
    };
  }

  if (!["bt", "nc", "os"].includes(user_state)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid state" })
    };
  }

  await supabase
    .from("guided_users")
    .update({ user_state })
    .eq("id", user_id);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, user_state })
  };
}

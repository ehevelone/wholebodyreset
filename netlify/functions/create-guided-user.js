import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const { email, source = "unknown" } = JSON.parse(event.body || "{}");

  if (!email) {
    return { statusCode: 400, body: "Missing email" };
  }

  const { data, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",

        // 🔑 EMAIL ENGINE INITIALIZATION
        bt_queue: ["hd-01-welcome.html"],
        current_email: "hd-01-welcome.html",

        current_module: "hydration",
        welcome_sent: false,

        source
      },
      { onConflict: "email" }
    )
    .select("id")
    .single();

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, user_id: data.id })
  };
}

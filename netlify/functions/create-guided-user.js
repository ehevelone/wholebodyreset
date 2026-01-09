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
    // 🔑 SAFELY parse body
    const body =
      typeof event.body === "string"
        ? JSON.parse(event.body)
        : event.body || {};

    const email = body.email;

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing email" })
      };
    }

    // 1️⃣ Create user + initialize queue
    const { data, error } = await supabase
      .from("guided_users")
      .upsert(
        {
          email,
          program: "guided_foundations",
          status: "active",

          bt_queue: ["hd-01-welcome.html"],
          current_email: "hd-01-welcome.html",
          current_module: "hydration"
        },
        { onConflict: "email" }
      )
      .select("id")
      .single();

    if (error) throw error;

    // 2️⃣ Trigger welcome email
    await fetch("https://wholebodyreset.life/.netlify/functions/send_email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: data.id })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, user_id: data.id })
    };

  } catch (err) {
    console.error("create-guided-user failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}

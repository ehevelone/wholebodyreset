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
    const { email, source = "unknown" } = JSON.parse(event.body || "{}");
    if (!email) {
      return { statusCode: 400, body: "Missing email" };
    }

    // 1️⃣ Upsert user AND FORCE queue initialization
    const { data: user, error } = await supabase
      .from("guided_users")
      .upsert(
        {
          email,
          program: "guided_foundations",
          status: "active",

          // 🔑 CRITICAL: always initialize queue on registration
          bt_queue: ["hd-01-welcome.html"],
          current_email: "hd-01-welcome.html",
          current_module: "hydration"
        },
        { onConflict: "email" }
      )
      .select("id")
      .single();

    if (error) throw error;

    // 2️⃣ Fire first email immediately
    await fetch(
      "https://wholebodyreset.life/.netlify/functions/send_email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id })
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, user_id: user.id })
    };

  } catch (err) {
    console.error("create-guided-user failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}

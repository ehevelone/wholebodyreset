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
    const { email } = JSON.parse(event.body || "{}");
    if (!email) return { statusCode: 400, body: "Missing email" };

    // 1️⃣ Check if user already exists
    const { data: existing } = await supabase
      .from("guided_users")
      .select("id")
      .eq("email", email)
      .single();

    // 2️⃣ Build payload
    const payload = {
      email,
      program: "guided_foundations",
      status: "active",
      current_email: "hd-01-welcome.html",
      current_module: "hydration"
    };

    // 🔑 ONLY initialize queue for NEW users
    if (!existing) {
      payload.bt_queue = ["hd-01-welcome.html"];
      payload.last_sent_at = null;
    }

    // 3️⃣ Upsert safely
    const { data, error } = await supabase
      .from("guided_users")
      .upsert(payload, { onConflict: "email" })
      .select("id")
      .single();

    if (error) throw error;

    // 4️⃣ Fire email immediately
    await fetch(`${process.env.SITE_URL}/.netlify/functions/send_email`, {
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
    return { statusCode: 500, body: err.message };
  }
}

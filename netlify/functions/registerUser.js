const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.registerUser = async function ({
  email,
  source = "unknown"
}) {
  if (!email) {
    throw new Error("registerUser: missing email");
  }

  // 1️⃣ Upsert user (idempotent)
  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",

        // ALWAYS set welcome email
        bt_queue: ["hd-01-welcome.html"],
        current_email: "hd-01-welcome.html",
        current_module: "hydration"
      },
      { onConflict: "email" }
    )
    .select("id")
    .single();

  if (error) throw error;

  // 2️⃣ ALWAYS fire welcome email
  await fetch(
    `${process.env.SITE_URL}/.netlify/functions/send_email`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id })
    }
  );

  return {
    user_id: user.id,
    source
  };
};

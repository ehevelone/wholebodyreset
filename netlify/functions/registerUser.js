const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function registerUser({
  email,
  source = "unknown",
  forceWelcome = false
}) {
  if (!email) {
    throw new Error("registerUser: missing email");
  }

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from("guided_users")
    .select("id")
    .eq("email", email)
    .single();

  const isNewUser = !existingUser;

  // Upsert user
  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",

        ...(isNewUser || forceWelcome
          ? {
              bt_queue: ["hd-01-welcome.html"],
              current_email: "hd-01-welcome.html",
              current_module: "hydration"
            }
          : {})
      },
      { onConflict: "email" }
    )
    .select("id")
    .single();

  if (error) throw error;

  // Send welcome email (SAFE, uses Netlify global fetch)
  if (isNewUser || forceWelcome) {
    try {
      await fetch(
        "https://wholebodyreset.life/.netlify/functions/send_email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id })
        }
      );
    } catch (err) {
      console.error("send_email failed (non-fatal):", err);
    }
  }

  return {
    user_id: user.id,
    created: isNewUser,
    source
  };
}

module.exports = { registerUser };

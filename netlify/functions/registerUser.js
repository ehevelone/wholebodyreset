const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function registerUser({ email }) {
  if (!email) throw new Error("Missing email");

  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",

        // initialize queue if missing
        bt_queue: ["hd-01-welcome.html"]
      },
      { onConflict: "email" }
    )
    .select("*")
    .single();

  if (error) throw error;

  return user;
}

module.exports = { registerUser };

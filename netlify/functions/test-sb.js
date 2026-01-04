import { createClient } from "@supabase/supabase-js";

export async function handler() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const email = `test-${Date.now()}@example.com`;

  const { data, error } = await supabase
    .from("guided_users")
    .insert([
      {
        email,
        program: "guided_foundations",
        status: "active",
        current_email: "hd-01-welcome.html",   // REQUIRED
        current_module: "hydration"
      }
    ])
    .select();

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      inserted: data[0]
    })
  };
}

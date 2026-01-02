import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "POST only" })
    };
  }

  // Create Supabase client using SERVICE ROLE KEY (server-side only)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Temporary test email (unique every call)
  const email = `test-${Date.now()}@example.com`;

  // INSERT guided user
  const { error } = await supabase
    .from("guided_users")
    .insert([
      {
        email: email,
        status: "active"
      }
    ]);

  // Handle insert error
  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        supabase_error: error.message
      })
    };
  }

  // Success response
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      supabase: "inserted",
      email: email
    })
  };
}

import { createClient } from "@supabase/supabase-js";

export async function handler() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from("guided_users")
    .select("id")
    .limit(1);

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
      rows_found: data.length
    })
  };
}

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler() {
  // harmless ping so Supabase counts activity
  await supabase.from("guided_users").select("id").limit(1);

  return {
    statusCode: 200,
    body: "Supabase keep-alive OK"
  };
}

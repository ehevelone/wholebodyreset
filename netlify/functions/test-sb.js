import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler() {
  const { data, error } = await supabase
    .from("test_events")
    .insert([{ source: "netlify-test" }]);

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, data })
  };
}

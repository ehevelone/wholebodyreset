import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const email = event.queryStringParameters?.email;

  if (!email) {
    return {
      statusCode: 401,
      body: JSON.stringify({ allowed: false })
    };
  }

  const { data, error } = await supabase
    .from("guided_users")
    .select("access_level")
    .eq("email", email)
    .single();

  if (error || !data) {
    return {
      statusCode: 401,
      body: JSON.stringify({ allowed: false })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      allowed: true,
      access_level: data.access_level
    })
  };
}

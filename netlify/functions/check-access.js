import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const cookie = event.headers.cookie || "";
    const match = cookie.match(/wbr_email=([^;]+)/);

    if (!match) {
      return {
        statusCode: 401,
        body: JSON.stringify({ allowed: false })
      };
    }

    const email = decodeURIComponent(match[1]);

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
  } catch {
    return {
      statusCode: 401,
      body: JSON.stringify({ allowed: false })
    };
  }
}

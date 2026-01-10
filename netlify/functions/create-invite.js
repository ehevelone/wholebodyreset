import { createClient } from "@supabase/supabase-js";
import { registerUser } from "./registerUser.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const { email } = JSON.parse(event.body || "{}");
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ ok: false }) };
  }

  // 🚀 IMMEDIATE ENROLLMENT + EMAIL
  await registerUser({ email });

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      message: "User enrolled and email sent"
    })
  };
}

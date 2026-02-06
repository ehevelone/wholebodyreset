// verify-access.js
// Purpose: Verify Foundations book access via Supabase email lookup ONLY

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ allowed: false, error: "Invalid JSON" })
    };
  }

  const email = body?.email?.trim().toLowerCase();

  if (!email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ allowed: false, error: "Missing email" })
    };
  }

  try {
    // ✅ Check Guided Foundations enrollment
    const { data, error } = await supabase
      .from("guided_users")
      .select("id,status")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) {
      return {
        statusCode: 200,
        body: JSON.stringify({ allowed: false })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed: true })
    };

  } catch (err) {
    console.error("verify-access error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ allowed: false, error: "Server error" })
    };
  }
}

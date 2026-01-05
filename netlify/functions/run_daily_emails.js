import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler() {
  const { data: users } = await supabase
    .from("guided_users")
    .select("id")
    .eq("paused", false);

  for (const user of users) {
    await fetch(process.env.SEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id })
    });
  }

  return {
    statusCode: 200,
    body: "Daily email run complete"
  };
}

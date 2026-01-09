import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Canonical user registration logic.
 * Called by:
 * - create-guided-user (HTTP / PowerShell)
 * - verify-invite
 * - Stripe webhook
 *
 * NEVER exposed directly to HTTP.
 */
export async function registerUser({
  email,
  source = "unknown",
  forceWelcome = false
}) {
  if (!email) {
    throw new Error("registerUser: missing email");
  }

  // 1️⃣ Check if user already exists
  const { data: existingUser } = await supabase
    .from("guided_users")
    .select("id")
    .eq("email", email)
    .single();

  const isNewUser = !existingUser;

  // 2️⃣ Upsert user
  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",

        // initialize queue ONLY when appropriate
        ...(isNewUser || forceWelcome
          ? {
              bt_queue: ["hd-01-welcome.html"],
              current_email: "hd-01-welcome.html",
              current_module: "hydration"
            }
          : {})
      },
      { onConflict: "email" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("registerUser upsert failed:", error);
    throw error;
  }

  // 3️⃣ Fire welcome email ONLY once (or when explicitly forced)
  if (isNewUser || forceWelcome) {
    await fetch(
      "https://wholebodyreset.life/.netlify/functions/send_email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id })
      }
    );
  }

  return {
    user_id: user.id,
    created: isNewUser,
    source
  };
}

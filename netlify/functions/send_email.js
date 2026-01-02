import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { email } = JSON.parse(event.body || "{}");

  if (!email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Email required" })
    };
  }

  // Insert or update user
  const { error } = await supabase
    .from("guided_users")
    .upsert({
      email,
      program: "guided_foundations",
      status: "active",
      current_email: "hd-01-welcome.html",
      last_sent_at: null
    }, { onConflict: "email" });

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ supabase_error: error.message })
    };
  }

  // Send welcome email
  const { error: emailError } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Welcome to Guided Foundations",
    html: "<p>Your Guided Foundations journey has begun.</p>"
  });

  if (emailError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ resend_error: emailError })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
}

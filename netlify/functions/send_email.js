import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// 🔍 Runtime verification (temporary but safe)
console.log(
  "RESEND_API_KEY present:",
  !!process.env.RESEND_API_KEY
);
console.log(
  "EMAIL_FROM value:",
  process.env.EMAIL_FROM
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "POST only"
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { to, email_file, program } = JSON.parse(event.body || "{}");

  if (!to || !email_file) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing to or email_file" })
    };
  }

  // Placeholder email body (safe + minimal)
  const html = `
    <p><strong>Whole Body Reset — Guided Foundations</strong></p>
    <p>Your next step is available.</p>
    <p>Reference file: <code>${email_file}</code></p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: "Whole Body Reset — Guided Foundations",
      html
    });

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          resend_error: error.message || error
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        exception: err.message
      })
    };
  }
}

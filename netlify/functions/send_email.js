import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_ROOT = path.join(process.cwd(), "emails", "templates");

function loadFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadEmailAssets(emailFile) {
  const htmlPath = path.join(EMAIL_ROOT, emailFile);
  const subjectPath = htmlPath.replace(".html", ".subject.txt");

  return {
    html: loadFile(htmlPath),
    subject: loadFile(subjectPath).trim()
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const { user_id } = JSON.parse(event.body || "{}");

    if (!user_id) {
      return { statusCode: 400, body: "Missing user_id" };
    }

    const { data: user, error } = await supabase
      .from("guided_users")
      .select("*")
      .eq("id", user_id)
      .single();

    if (error || !user) {
      throw new Error("User not found");
    }

    const emailFile = user.bt_queue?.[0];
    if (!emailFile) {
      return { statusCode: 200, body: "No email queued" };
    }

    const { html, subject } = loadEmailAssets(emailFile);

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject,
      html
    });

    await supabase
      .from("guided_users")
      .update({
        last_sent_at: new Date().toISOString(),
        bt_queue: user.bt_queue.slice(1)
      })
      .eq("id", user_id);

    return { statusCode: 200, body: "Email sent" };

  } catch (err) {
    console.error("send_email error:", err);
    return { statusCode: 500, body: err.message };
  }
}

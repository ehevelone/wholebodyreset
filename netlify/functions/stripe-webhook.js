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

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing HTML file: ${emailFile}`);
  }
  if (!fs.existsSync(subjectPath)) {
    throw new Error(`Missing subject file: ${emailFile}`);
  }

  return {
    html: loadFile(htmlPath),
    subject: loadFile(subjectPath).trim()
  };
}

function daysSince(dateString) {
  if (!dateString) return Infinity;
  const last = new Date(dateString);
  const now = new Date();
  return (now - last) / (1000 * 60 * 60 * 24);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { user_id, template } = body;

    if (!user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing user_id" })
      };
    }

    const { data: user, error } = await supabase
      .from("guided_users")
      .select("id,email,current_email,current_module,last_sent_at,welcome_sent")
      .eq("id", user_id)
      .single();

    if (error || !user) throw new Error("User not found");

    // Decide cadence by current_module (matches your schema)
    const cadenceDays = user.current_module === "hydration" ? 0 : 6; // 0 = immediate for hydration welcome

    if (daysSince(user.last_sent_at) < cadenceDays) {
      return { statusCode: 200, body: JSON.stringify({ message: "Cadence hold" }) };
    }

    const emailFile = template || user.current_email;
    if (!emailFile) {
      return { statusCode: 200, body: JSON.stringify({ message: "No email to send" }) };
    }

    // Optional: don't re-send welcome if already sent
    if (emailFile === "hd-01-welcome.html" && user.welcome_sent) {
      return { statusCode: 200, body: JSON.stringify({ message: "Welcome already sent" }) };
    }

    const { html, subject } = loadEmailAssets(emailFile);

    const { error: sendError } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject,
      html
    });

    if (sendError) throw new Error(sendError.message);

    const updates = {
      last_sent_at: new Date().toISOString()
    };

    if (emailFile === "hd-01-welcome.html") {
      updates.welcome_sent = true;
    }

    await supabase.from("guided_users").update(updates).eq("id", user.id);

    return { statusCode: 200, body: JSON.stringify({ sent: emailFile }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

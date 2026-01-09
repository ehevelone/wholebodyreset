const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

// 🔍 Debug (safe)
console.log("send_email SUPABASE_URL =", process.env.SUPABASE_URL);

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Resolve templates RELATIVE TO THIS FILE (Netlify-safe)
const EMAIL_ROOT = path.join(__dirname, "..", "emails", "templates");

function loadFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadEmailAssets(relativeEmailPath) {
  const htmlPath = path.join(EMAIL_ROOT, relativeEmailPath);
  const subjectPath = htmlPath.replace(".html", ".subject.txt");

  if (!fs.existsSync(htmlPath)) {
    console.error("Missing HTML template:", htmlPath);
    return null;
  }

  if (!fs.existsSync(subjectPath)) {
    console.error("Missing subject template:", subjectPath);
    return null;
  }

  return {
    html: loadFile(htmlPath),
    subject: loadFile(subjectPath).trim()
  };
}

exports.handler = async function (event) {
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
      console.error("User not found:", user_id);
      return { statusCode: 200, body: "User not found" };
    }

    const emailPath = user.bt_queue?.[0];
    if (!emailPath) {
      return { statusCode: 200, body: "No email queued" };
    }

    const assets = loadEmailAssets(emailPath);
    if (!assets) {
      return { statusCode: 200, body: "Email assets missing" };
    }

    await resend.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "Whole Body Reset <support@wholelifereset.life>",
      to: user.email,
      subject: assets.subject,
      html: assets.html
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
    // NEVER propagate failure upstream
    return { statusCode: 200, body: "Email send failed (logged)" };
  }
};

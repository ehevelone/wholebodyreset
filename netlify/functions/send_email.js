const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔑 RESTORED — ORIGINAL WORKING PATH
const EMAIL_ROOT = path.join(process.cwd(), "emails", "templates");

function loadFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadEmailAssets(relativeEmailPath) {
  const htmlPath = path.join(EMAIL_ROOT, relativeEmailPath);
  const subjectPath = htmlPath.replace(".html", ".subject.txt");

  if (!fs.existsSync(htmlPath)) {
    console.log("send_email: missing HTML", htmlPath);
    return null;
  }

  if (!fs.existsSync(subjectPath)) {
    console.log("send_email: missing subject", subjectPath);
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
      console.log("send_email: user not found", user_id);
      return { statusCode: 200, body: "User not found" };
    }

    const emailPath = user.bt_queue?.[0];
    if (!emailPath) {
      console.log("send_email: no email queued");
      return { statusCode: 200, body: "No email queued" };
    }

    const assets = loadEmailAssets(emailPath);
    if (!assets) {
      console.log("send_email: assets missing for", emailPath);
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

    console.log("send_email: sent to", user.email);
    return { statusCode: 200, body: "Email sent" };

  } catch (err) {
    console.error("send_email fatal", err);
    return { statusCode: 200, body: "Email failed (logged)" };
  }
};

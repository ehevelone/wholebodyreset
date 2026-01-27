const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_ROOT = path.join(process.cwd(), "emails", "templates");

function loadFile(p) {
  return fs.readFileSync(p, "utf8");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const { email, email_file } = JSON.parse(event.body || "{}");

    if (!email || !email_file) {
      return { statusCode: 400, body: "Missing email or email_file" };
    }

    const htmlPath = path.join(EMAIL_ROOT, email_file);
    const subjectPath = htmlPath.replace(".html", ".subject.txt");

    if (!fs.existsSync(htmlPath) || !fs.existsSync(subjectPath)) {
      console.log("send_email missing assets:", email_file);
      return { statusCode: 200, body: "Missing email assets" };
    }

    const html = loadFile(htmlPath);
    const subject = loadFile(subjectPath).trim();

    await resend.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "Whole Body Reset <support@wholebodyreset.life>",
      to: email,
      subject,
      html
    });

    console.log("send_email: sent", email_file, "to", email);

    return { statusCode: 200, body: "Email sent" };

  } catch (err) {
    console.error("send_email fatal:", err);
    return { statusCode: 500, body: "Send failed" };
  }
};

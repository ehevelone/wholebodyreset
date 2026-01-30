const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// Supabase is not strictly required here, but keeping it avoids breaking imports
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 🔒 NETLIFY-SAFE EMAIL TEMPLATE ROOT
 * Templates MUST live in:
 * netlify/functions/emails/templates/
 */
const EMAIL_ROOT = path.join(__dirname, "emails", "templates");

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
      console.error("send_email missing assets", {
        htmlPath,
        subjectPath
      });
      return { statusCode: 500, body: "Email assets missing" };
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

const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * 🔒 NETLIFY-SAFE EMAIL TEMPLATE ROOT
 * All email paths are resolved RELATIVE to this directory
 *
 * Example email_file:
 *   hydration/intro/hd-00-start-here.html
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

    // 🔐 Prevent directory traversal
    const safePath = path.normalize(email_file).replace(/^(\.\.(\/|\\|$))+/, "");

    const htmlPath = path.join(EMAIL_ROOT, safePath);
    const subjectPath = htmlPath.replace(/\.html$/, ".subject.txt");

    if (!fs.existsSync(htmlPath) || !fs.existsSync(subjectPath)) {
      console.error("EMAIL ASSETS MISSING", {
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

    console.log("EMAIL SENT", safePath, "→", email);
    return { statusCode: 200, body: "Email sent" };

  } catch (err) {
    console.error("SEND EMAIL ERROR", err);
    return { statusCode: 500, body: "Send failed" };
  }
};

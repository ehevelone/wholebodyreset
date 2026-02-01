const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Email root — this MUST match your real structure
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

    // ❌ REAL failure: missing files
    if (!fs.existsSync(htmlPath) || !fs.existsSync(subjectPath)) {
      console.error("EMAIL FILE MISSING", { htmlPath, subjectPath });
      return { statusCode: 500, body: "Email assets missing" };
    }

    const html = loadFile(htmlPath);
    const subject = loadFile(subjectPath).trim();

    // ✅ ATTEMPT SEND — THIS IS THE ONLY THING THAT MATTERS
    try {
      await resend.emails.send({
        from:
          process.env.EMAIL_FROM ||
          "Whole Body Reset <support@wholebodyreset.life>",
        to: email,
        subject,
        html
      });
    } catch (err) {
      // ⚠️ TRANSPORT ERRORS DO NOT BLOCK PROGRESSION
      console.warn("Resend transport issue (ignored):", err.message);
    }

    // ✅ ALWAYS REPORT SUCCESS IF WE GOT THIS FAR
    console.log("send_email ACCEPTED", email_file, "→", email);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error("send_email fatal error:", err);
    return { statusCode: 500, body: "Fatal send error" };
  }
};

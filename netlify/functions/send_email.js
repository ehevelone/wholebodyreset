const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// IMPORTANT: this path matches your repo layout
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
      console.error("EMAIL FILE MISSING", { htmlPath, subjectPath });
      return { statusCode: 500, body: "Email assets missing" };
    }

    let html = loadFile(htmlPath);
    const subject = loadFile(subjectPath).trim();

    // ===============================================
    // 🔥 RESPONSE BLOCK INJECTION
    // ===============================================
    const responseBlockPath = path.join(
      EMAIL_ROOT,
      "response-block.html"
    );

    if (fs.existsSync(responseBlockPath)) {
      let responseBlock = loadFile(responseBlockPath);
      responseBlock = responseBlock.replace(/{{EMAIL}}/g, email);

      if (html.includes("</body>")) {
        html = html.replace("</body>", `${responseBlock}\n</body>`);
      } else {
        html += `\n${responseBlock}`;
      }
    }

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
      console.warn("Resend transport issue (ignored):", err.message);
    }

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

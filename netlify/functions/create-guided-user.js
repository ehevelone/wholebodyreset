const { registerUser } = require("./registerUser.js");

exports.handler = async function (event) {
  console.log("CGU invoked");

  if (event.httpMethod !== "POST") {
    console.log("CGU blocked: wrong method", event.httpMethod);
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const { email } = JSON.parse(event.body || "{}");

    if (!email) {
      console.log("CGU blocked: missing email");
      return { statusCode: 400, body: "Missing email" };
    }

    console.log("CGU start for email:", email);

    // 1️⃣ Create / update user
    const user = await registerUser({ email });

    console.log("CGU user record:", {
      id: user.id,
      last_sent_at: user.last_sent_at
    });

    // 2️⃣ Decide whether to send email
    if (!user.last_sent_at) {
      console.log("CGU sending welcome email");

      try {
        await fetch(
          "https://wholebodyreset.life/.netlify/functions/send_email",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: user.id })
          }
        );
        console.log("CGU send_email call completed");
      } catch (e) {
        console.error("CGU send_email FAILED (non-fatal)", e);
      }

    } else {
      console.log("CGU email skipped: already sent at", user.last_sent_at);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        user_id: user.id,
        emailSent: !user.last_sent_at
      })
    };

  } catch (err) {
    console.error("CGU fatal error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false })
    };
  }
};
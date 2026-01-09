const { registerUser } = require("./registerUser.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const {
      email,
      source = "unknown",
      forceWelcome = false
    } = JSON.parse(event.body || "{}");

    if (!email) {
      return { statusCode: 400, body: "Missing email" };
    }

    const result = await registerUser({
      email,
      source,
      forceWelcome
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...result })
    };

  } catch (err) {
    console.error("create-guided-user error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false })
    };
  }
};

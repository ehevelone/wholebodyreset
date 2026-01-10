const { registerUser } = require("./registerUser.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const { email } = JSON.parse(event.body || "{}");
    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing email" })
      };
    }

    console.log("create-invite HIT:", email);

    const result = await registerUser({ email });

    console.log("create-invite DONE user_id:", result?.user_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "User enrolled + email sent",
        ...result
      })
    };
  } catch (err) {
    console.error("create-invite ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err?.message || "failed"
      })
    };
  }
};

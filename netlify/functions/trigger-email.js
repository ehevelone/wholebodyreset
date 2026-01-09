export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "POST only"
    };
  }

  try {
    const { user_id } = JSON.parse(event.body || "{}");

    if (!user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing user_id" })
      };
    }

    // 🔔 Call the email engine (queue-based)
    const res = await fetch(
      `${process.env.SITE_URL}/.netlify/functions/send_email`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id })
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("send_email failed:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error("trigger-email error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false })
    };
  }
}

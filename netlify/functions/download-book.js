const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  try {
    const email = event.queryStringParameters?.email;
    if (!email) {
      return { statusCode: 400, body: "Missing email" };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 🔎 Verify enrollment
    const { data: user, error } = await supabase
      .from("guided_users")
      .select("id,email,status")
      .eq("email", email)
      .eq("status", "active")
      .single();

    if (error || !user) {
      return {
        statusCode: 403,
        body: "Not enrolled"
      };
    }

    // 🧾 LOG DOWNLOAD (non-blocking but recorded)
    await supabase.from("book_downloads").insert({
      email: user.email,
      user_id: user.id,
      source: "welcome_page"
    });

    // 📄 Load PDF
    const filePath = path.join(
      __dirname,
      "assets",
      "Whole-Body-Reset-Foundations.pdf"
    );

    const fileBuffer = fs.readFileSync(filePath);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "inline; filename=\"Whole-Body-Reset-Foundations.pdf\"",
        "Cache-Control": "no-store"
      },
      body: fileBuffer.toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error("❌ download-book error:", err);
    return {
      statusCode: 500,
      body: "Server error"
    };
  }
};

const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");
const { createClient } = require("@supabase/supabase-js");

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_ROOT = path.join(process.cwd(), "emails", "templates");

async function registerUser({
  email,
  test_mode = false,
  test_interval_hours = null
}) {
  if (!email) throw new Error("Missing email");

  const insertPayload = {
    email,
    program: "guided_foundations",
    status: "active",
    current_email: "hd-01-welcome.html",
    current_module: "hydration",
    test_mode: !!test_mode
  };

  if (test_mode && test_interval_hours) {
    insertPayload.test_interval_hours = test_interval_hours;
  }

  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(insertPayload, { onConflict: "email" })
    .select("*")
    .single();

  if (error) throw error;

  const htmlPath = path.join(EMAIL_ROOT, "hd-01-welcome.html");
  const subjectPath = path.join(
    EMAIL_ROOT,
    "hd-01-welcome.subject.txt"
  );

  const html = fs.readFileSync(htmlPath, "utf8");
  const subject = fs.readFileSync(subjectPath, "utf8").trim();

  await resend.emails.send({
    from: "onboarding@resend.dev", // SAFE SENDER
    to: email,
    subject,
    html
  });

  await supabase
    .from("guided_users")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", user.id);

  return { ok: true };
}

// 🔑 NETLIFY ENTRY POINT (THIS WAS MISSING)
exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const result = await registerUser(payload);

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error("create-guided-user ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};

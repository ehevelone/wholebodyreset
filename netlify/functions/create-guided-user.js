const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");
const { createClient } = require("@supabase/supabase-js");

// 🔐 Services
const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 📂 EMAIL TEMPLATE ROOT
const EMAIL_ROOT = path.join(process.cwd(), "emails", "templates");

// 🔑 SINGLE SOURCE OF TRUTH
exports.registerUser = async function ({
  email,
  test_mode = false,
  test_interval_hours = null
}) {
  if (!email) {
    throw new Error("registerUser: missing email");
  }

  /* -------------------------------------------------
     1️⃣ UPSERT USER ROW
  ------------------------------------------------- */
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

  if (error) {
    console.error("registerUser: supabase error", error);
    throw error;
  }

  /* -------------------------------------------------
     2️⃣ LOAD EMAIL FILES
  ------------------------------------------------- */
  const htmlPath = path.join(EMAIL_ROOT, "hd-01-welcome.html");
  const subjectPath = path.join(
    EMAIL_ROOT,
    "hd-01-welcome.subject.txt"
  );

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing email HTML: ${htmlPath}`);
  }

  if (!fs.existsSync(subjectPath)) {
    throw new Error(`Missing email subject: ${subjectPath}`);
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const subject = fs.readFileSync(subjectPath, "utf8").trim();

  /* -------------------------------------------------
     3️⃣ SEND EMAIL
  ------------------------------------------------- */
  await resend.emails.send({
    from:
      process.env.EMAIL_FROM ||
      "Whole Body Reset <support@wholelifereset.life>",
    to: email,
    subject,
    html
  });

  /* -------------------------------------------------
     4️⃣ RECORD SEND
  ------------------------------------------------- */
  await supabase
    .from("guided_users")
    .update({
      last_sent_at: new Date().toISOString()
    })
    .eq("id", user.id);

  return {
    ok: true,
    user_id: user.id
  };
};

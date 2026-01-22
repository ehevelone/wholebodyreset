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

exports.registerUser = async function ({ email, product = "guided" }) {
  if (!email) throw new Error("registerUser: missing email");

  console.log("registerUser START:", email, "product:", product);

  // 🔀 Select email + program by product
  let htmlFile;
  let subjectFile;
  let program;

  if (product === "ai") {
    htmlFile = "ai-01-welcome.html";
    subjectFile = "ai-01-welcome.subject.txt";
    program = "ai_guided_foundations";
  } else {
    htmlFile = "hd-01-welcome.html";
    subjectFile = "hd-01-welcome.subject.txt";
    program = "guided_foundations";
  }

  const htmlPath = path.join(EMAIL_ROOT, htmlFile);
  const subjectPath = path.join(EMAIL_ROOT, subjectFile);

  const html = fs.readFileSync(htmlPath, "utf8");
  const subject = fs.readFileSync(subjectPath, "utf8").trim();

  // 🧠 Upsert user + initialize program state
  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program,
        status: "active",
        current_email: htmlFile,
        current_module: "hydration"
      },
      { onConflict: "email" }
    )
    .select("id,email")
    .single();

  if (error) throw error;

  console.log("registerUser UPSERT OK user_id:", user.id);
  console.log("registerUser SENDING EMAIL:", htmlFile);

  await resend.emails.send({
    from:
      process.env.EMAIL_FROM ||
      "Whole Body Reset <support@wholelifereset.life>",
    to: email,
    subject,
    html
  });

  console.log("registerUser EMAIL SENT");

  await supabase
    .from("guided_users")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", user.id);

  console.log("registerUser last_sent_at updated");

  return { user_id: user.id };
};

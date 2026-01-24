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

  /* ===============================
     AI-GUIDED FLOW
     =============================== */
  if (product === "ai") {
    const htmlFile = "ai-01-welcome.html";
    const subjectFile = "ai-01-welcome.subject.txt";

    const html = fs.readFileSync(
      path.join(EMAIL_ROOT, htmlFile),
      "utf8"
    );
    const subject = fs
      .readFileSync(path.join(EMAIL_ROOT, subjectFile), "utf8")
      .trim();

    const { data, error } = await supabase
      .from("ai_journey")
      .upsert(
        {
          email,
          status: "active",
          current_step: "entry",
          current_email: htmlFile,
          updated_at: new Date().toISOString()
        },
        { onConflict: "email" }
      )
      .select("id")
      .single();

    if (error) throw error;

    await resend.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "Whole Body Reset <support@wholelifereset.life>",
      to: email,
      subject,
      html
    });

    console.log("AI welcome email sent");

    return { user_id: data.id, program: "ai" };
  }

  /* ===============================
     GUIDED FOUNDATIONS FLOW
     =============================== */
  const htmlFile = "hd-01-welcome.html";
  const subjectFile = "hd-01-welcome.subject.txt";

  const html = fs.readFileSync(
    path.join(EMAIL_ROOT, htmlFile),
    "utf8"
  );
  const subject = fs
    .readFileSync(path.join(EMAIL_ROOT, subjectFile), "utf8")
    .trim();

  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",
        current_email: htmlFile,
        current_module: "hydration",
        updated_at: new Date().toISOString()
      },
      { onConflict: "email" }
    )
    .select("id,email")
    .single();

  if (error) throw error;

  await resend.emails.send({
    from:
      process.env.EMAIL_FROM ||
      "Whole Body Reset <support@wholelifereset.life>",
    to: email,
    subject,
    html
  });

  console.log("Guided welcome email sent");

  return { user_id: user.id, program: "guided" };
};

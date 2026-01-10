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

exports.registerUser = async function ({ email }) {
  if (!email) throw new Error("missing email");

  const html = fs.readFileSync(
    path.join(EMAIL_ROOT, "hd-01-welcome.html"),
    "utf8"
  );

  const subject = fs.readFileSync(
    path.join(EMAIL_ROOT, "hd-01-welcome.subject.txt"),
    "utf8"
  ).trim();

  const { data: user, error } = await supabase
    .from("guided_users")
    .upsert(
      {
        email,
        program: "guided_foundations",
        status: "active",
        current_email: "hd-01-welcome.html",
        current_module: "hydration",
        last_sent_at: new Date().toISOString()
      },
      { onConflict: "email" }
    )
    .select("id")
    .single();

  if (error) throw error;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Whole Body Reset <support@wholelifereset.life>",
    to: email,
    subject,
    html
  });

  return { user_id: user.id };
};

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const PROGRAM = "guided_foundations";

// ⏱️ DELAY BETWEEN WELCOME → START HERE
const MIN_NEXT_DELAY_MINUTES = 5;

const nowIso = () => new Date().toISOString();
const addDaysISO = d => new Date(Date.now() + d * 86400000).toISOString();
const addMinutesISO = m => new Date(Date.now() + m * 60000).toISOString();

function moduleFromEmailFilename(name = "") {
  if (name.startsWith("hd-")) return "hydration";
  if (name.startsWith("mn-")) return "minerals";
  if (name.startsWith("pr-")) return "parasites";
  if (name.startsWith("mt-")) return "metals";
  return "foundations";
}

/**
 * 🔒 HARD-CODED INTRO ORDER
 * Welcome → Start Here → rest of program
 */
function loadSequence() {
  const filePath = path.join(__dirname, "foundations_email_sequence.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const sequence = [];

  // ✅ INTRO ORDER (DO NOT TRUST JSON ORDER)
  const INTRO_ORDER = [
    "hd-01-welcome.html",
    "hd-00-start-here.html"
  ];

  for (const email of INTRO_ORDER) {
    sequence.push({ email, cadence_days: 0 });
  }

  // ✅ ALL OTHER PHASES (DAILY CADENCE)
  for (const phaseKey of Object.keys(data.phases)) {
    if (phaseKey === "hydration") continue;

    const phase = data.phases[phaseKey];
    for (const group of Object.values(phase)) {
      for (const email of group) {
        sequence.push({ email, cadence_days: 1 });
      }
    }
  }

  return sequence;
}

/**
 * "__START__" or null = user has received NOTHING yet
 */
function findNextEmail(sequence, current) {
  if (!current || current === "__START__") {
    return sequence[0]; // WELCOME
  }

  const idx = sequence.findIndex(e => e.email === current);
  return idx === -1 || idx + 1 >= sequence.length
    ? null
    : sequence[idx + 1];
}

async function sendEmail(payload) {
  const res = await fetch(
    "https://wholebodyreset.life/.netlify/functions/send_email",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  return res.ok;
}

exports.handler = async function () {
  console.log("DAILY DISPATCH RUN", new Date().toISOString());

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sequence = loadSequence();

  const { data: users, error } = await supabase
    .from("guided_users")
    .select("*")
    .eq("program", PROGRAM)
    .eq("status", "active")
    .eq("is_paused", false);

  if (error) {
    console.error("Supabase error:", error);
    return { statusCode: 500, body: error.message };
  }

  const now = Date.now();

  for (const user of users) {
    // ⛔ Too early to send next email
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    const next = findNextEmail(sequence, user.current_email);
    if (!next) continue;

    console.log("SENDING", next.email, "TO", user.email);

    const sent = await sendEmail({
      email: user.email,
      email_file: next.email
    });

    if (!sent) {
      console.error("FAILED SEND", user.email, next.email);
      continue;
    }

    const nextAt =
      next.cadence_days === 0
        ? addMinutesISO(MIN_NEXT_DELAY_MINUTES)
        : addDaysISO(next.cadence_days);

    await supabase
      .from("guided_users")
      .update({
        current_email: next.email,
        current_module: moduleFromEmailFilename(next.email),
        last_sent_at: nowIso(),
        next_email_at: nextAt
      })
      .eq("id", user.id);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};

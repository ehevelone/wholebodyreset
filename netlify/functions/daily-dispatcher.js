const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const PROGRAM = "guided_foundations";

// ⏱️ Delay between Welcome → Start Here
const MIN_NEXT_DELAY_MINUTES = 5;

const nowIso = () => new Date().toISOString();
const addDaysISO = d => new Date(Date.now() + d * 86400000).toISOString();
const addMinutesISO = m => new Date(Date.now() + m * 60000).toISOString();

/**
 * JSON PHASE → ACTUAL TEMPLATE FOLDER
 */
const PHASE_FOLDER_MAP = {
  hydration: "hydration",
  hydration_paths: "hydration",
  minerals: "minerals",
  parasites: "parasites",
  metals: "metals",
  maintenance: "maintenance"
};

function moduleFromEmailPath(p = "") {
  if (p.startsWith("hydration/")) return "hydration";
  if (p.startsWith("minerals/")) return "minerals";
  if (p.startsWith("parasites/")) return "parasites";
  if (p.startsWith("metals/")) return "metals";
  return "foundations";
}

/**
 * 🔒 BUILD FULL, REAL TEMPLATE PATHS
 */
function loadSequence() {
  const jsonPath = path.join(__dirname, "foundations_email_sequence.json");
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const sequence = [];

  // 🔐 HARD-ENFORCED INTRO ORDER
  sequence.push(
    { email: "hydration/intro/hd-01-welcome.html", cadence_days: 0 },
    { email: "hydration/intro/hd-00-start-here.html", cadence_days: 0 }
  );

  // 🔁 ALL OTHER PHASES (DAILY CADENCE)
  for (const phaseKey of Object.keys(data.phases)) {
    if (phaseKey === "hydration") continue;

    const folder = PHASE_FOLDER_MAP[phaseKey];
    if (!folder) continue;

    const phase = data.phases[phaseKey];

    for (const groupKey of Object.keys(phase)) {
      for (const file of phase[groupKey]) {
        sequence.push({
          email: `${folder}/${groupKey}/${file}`,
          cadence_days: 1
        });
      }
    }
  }

  return sequence;
}

/**
 * null or "__START__" → first email
 */
function findNextEmail(sequence, current) {
  if (!current || current === "__START__") {
    return sequence[0];
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
    console.error("SUPABASE ERROR", error);
    return { statusCode: 500, body: error.message };
  }

  const now = Date.now();

  for (const user of users) {
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
        current_module: moduleFromEmailPath(next.email),
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

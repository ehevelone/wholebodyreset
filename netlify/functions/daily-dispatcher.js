// 🔥 FORCE GIT CHANGE - DD MAILMAN MODE
// netlify/functions/daily-dispatcher.js
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const PROGRAM = "guided_foundations";
const WELCOME_TO_START_MINUTES = 5;
const DEFAULT_TEST_INTERVAL_MINUTES = 2;

// hard safety buffer to prevent resend loops
const SAFETY_BUFFER_MS = 2 * 60 * 1000;

const addDaysISO = d => new Date(Date.now() + d * 86400000).toISOString();
const addMinutesISO = m => new Date(Date.now() + m * 60000).toISOString();

const PHASE_FOLDER_MAP = {
  hydration: "hydration",
  hydration_paths: "hydration",
  minerals: "minerals",
  parasites: "parasites",
  metals: "metals",
  maintenance: "maintenance"
};

function loadSequence() {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "foundations_email_sequence.json"),
      "utf8"
    )
  );

  const seq = [];

  // INTRO
  ["hd-01-welcome.html", "hd-00-start-here.html"].forEach(f =>
    seq.push({ email: `hydration/${f}` })
  );

  // hydration paths
  const hp = data?.phases?.hydration_paths || {};
  Object.keys(hp).forEach(g =>
    hp[g].forEach(f => seq.push({ email: `hydration/${g}/${f}` }))
  );

  // remaining phases
  Object.keys(data.phases || {}).forEach(phase => {
    if (phase === "hydration" || phase === "hydration_paths") return;
    const folder = PHASE_FOLDER_MAP[phase];
    if (!folder) return;

    Object.keys(data.phases[phase]).forEach(g =>
      data.phases[phase][g].forEach(f =>
        seq.push({ email: `${folder}/${g}/${f}` })
      )
    );
  });

  return seq;
}

function findNextEmail(seq, current) {
  if (!current || current === "__START__") return seq[0];
  const i = seq.findIndex(e => e.email === current);
  return i === -1 || i + 1 >= seq.length ? null : seq[i + 1];
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

// 🔥 NEW: HANDOFF TO UPDATE-USER (THE BRAIN)
async function notifyUpdateUser(payload) {
  const res = await fetch(
    "https://wholebodyreset.life/.netlify/functions/update-user",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  return res.ok;
}

exports.handler = async function () {
  console.log("📬 DAILY DISPATCH RUN", new Date().toISOString());

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const seq = loadSequence();
  const now = Date.now();

  const { data: users, error } = await supabase
    .from("guided_users")
    .select("*")
    .eq("program", PROGRAM)
    .in("status", ["active", "enrolled", "started"])
    .or("is_paused.is.null,is_paused.eq.false");

  if (error) {
    console.error("FETCH USERS ERROR:", error);
    return { statusCode: 500, body: "Fetch error" };
  }

  console.log("📨 Users found:", users.length);

  for (const user of users) {
    if (user.awaiting_input) continue;
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    if (user.last_sent_at) {
      const last = Date.parse(user.last_sent_at);
      if (now - last < SAFETY_BUFFER_MS) continue;
    }

    const next = findNextEmail(seq, user.current_email || "__START__");
    if (!next) continue;

    console.log("➡️ SENDING:", next.email, "TO:", user.email);

    const sent = await sendEmail({
      email: user.email,
      email_file: next.email
    });

    if (!sent) {
      console.error("❌ SEND FAILED:", user.email);
      continue;
    }

    // 🔥 HANDOFF — THIS IS THE FIX
    const updated = await notifyUpdateUser({
      email: user.email,
      sent_email: next.email,
      event: "email_sent"
    });

    if (!updated) {
      console.error("❌ UPDATE-USER FAILED:", user.email);
    } else {
      console.log("✅ UPDATE-USER CALLED:", user.email);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};

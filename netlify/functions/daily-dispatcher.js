// netlify/functions/daily-dispatcher.js
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const PROGRAM = "guided_foundations";
const WELCOME_TO_START_MINUTES = 5;
const DEFAULT_TEST_INTERVAL_MINUTES = 2;
const REAL_USER_DAYS_AFTER_START_HERE = 3;

const nowIso = () => new Date().toISOString();
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

function moduleFromEmailPath(p = "") {
  if (p.startsWith("hydration/")) return "hydration";
  if (p.startsWith("minerals/")) return "minerals";
  if (p.startsWith("parasites/")) return "parasites";
  if (p.startsWith("metals/")) return "metals";
  if (p.startsWith("maintenance/")) return "maintenance";
  return "foundations";
}

function loadSequence() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "foundations_email_sequence.json"), "utf8")
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

  // everything else
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
  const r = await fetch("https://wholebodyreset.life/.netlify/functions/send_email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return r.ok;
}

function getTestIntervalMinutes(u) {
  const h = Number(u.test_interval_hours);
  if (!Number.isFinite(h) || h <= 0) return DEFAULT_TEST_INTERVAL_MINUTES;
  return Math.max(1, Math.round(h * 60));
}

function isHydrationPathEmail(p = "") {
  return p.startsWith("hydration/") && /\/(bt|nc|os)\//.test(p);
}

function applyHydrationBranch(p, state) {
  if (!isHydrationPathEmail(p)) return p;
  return p.replace(/^hydration\/(bt|nc|os)\//, `hydration/${state}/`);
}

exports.handler = async function () {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const seq = loadSequence();
  const now = Date.now();

  const { data: users } = await supabase
    .from("guided_users")
    .select("*")
    .eq("program", PROGRAM)
    .eq("status", "active")
    .eq("is_paused", false);

  for (const user of users) {
    if (user.awaiting_input) continue;
    if (user.next_email_at && Date.parse(user.next_email_at) > now) continue;

    const base = findNextEmail(seq, user.current_email);
    if (!base) continue;

    const state = (user.user_state || "nc").toLowerCase();
    const emailToSend = isHydrationPathEmail(base.email)
      ? applyHydrationBranch(base.email, state)
      : base.email;

    const sent = await sendEmail({
      email: user.email,
      email_file: emailToSend
    });
    if (!sent) continue;

    const isTester = user.test_mode === true;
    const testMin = isTester ? getTestIntervalMinutes(user) : null;

    let nextAt = null;
    let awaiting = false;

    if (emailToSend === "hydration/hd-01-welcome.html") {
      nextAt = addMinutesISO(WELCOME_TO_START_MINUTES);
    } else if (emailToSend === "hydration/hd-00-start-here.html") {
      nextAt = isTester
        ? addMinutesISO(testMin)
        : addDaysISO(REAL_USER_DAYS_AFTER_START_HERE);
    } else if (isHydrationPathEmail(emailToSend)) {
      awaiting = true;
    } else {
      nextAt = isTester ? addMinutesISO(testMin) : addDaysISO(1);
    }

    // 🔥 GUARANTEED ADVANCE
    await supabase
      .from("guided_users")
      .update({
        current_email: emailToSend,
        current_module: moduleFromEmailPath(emailToSend),
        last_sent_at: nowIso(),
        next_email_at: nextAt,
        awaiting_input: awaiting
      })
      .eq("id", user.id)
      .eq("email", user.email);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

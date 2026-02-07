import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const addMinutesISO = m =>
  new Date(Date.now() + m * 60000).toISOString();

function htmlPage(title, msg) {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: `<!doctype html>
<html>
<body style="font-family:Georgia,serif;background:#efe4c9;color:#2f3b2f;padding:24px">
<h2>${title}</h2>
<p>${msg}</p>
</body></html>`
  };
}

export async function handler(event) {
  const method = event.httpMethod;
  if (!["GET", "POST"].includes(method)) {
    return { statusCode: 405, body: "GET or POST only" };
  }

  let payload = {};
  if (method === "POST") {
    payload = JSON.parse(event.body || "{}");
  } else {
    payload = event.queryStringParameters || {};
  }

  const email = (payload.email || "").trim();
  const response = (payload.response || "").toLowerCase();

  if (!email || !["better", "same", "worse"].includes(response)) {
    return htmlPage("Invalid link", "This response link is not valid.");
  }

  const { data: user } = await supabase
    .from("guided_users")
    .select("*")
    .eq("email", email)
    .single();

  if (!user) {
    return htmlPage("User not found", "We couldn’t find your account.");
  }

  if (user.awaiting_input !== true) {
    return htmlPage("Already received", "Your response was already saved.");
  }

  let user_state = "nc";
  if (response === "better") user_state = "bt";
  if (response === "worse") user_state = "os";

  const { error } = await supabase
    .from("guided_users")
    .update({
      user_state,
      last_user_response: response,
      awaiting_input: false,
      next_email_at: addMinutesISO(5)
    })
    .eq("id", user.id);

  if (error) {
    return htmlPage("Error", "We couldn’t save your response. Please try again.");
  }

  return htmlPage(
    "Response received",
    "Thanks — your check-in was saved. You can close this page."
  );
}

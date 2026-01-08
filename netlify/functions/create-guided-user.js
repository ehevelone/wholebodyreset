import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const body = JSON.parse(event.body || "{}");
    const { email, stripe_customer_id } = body;

    if (!email || !stripe_customer_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing email or stripe_customer_id" })
      };
    }

    const { data, error } = await supabase
      .from("guided_users")
      .insert({
        email,
        stripe_customer_id,
        program: "guided_foundations",
        status: "active",

        current_email: "hd-01-welcome.html",
        current_module: "hydration",
        bt_queue: ["hd-01-welcome.html"],
        welcome_sent: false
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id: data.id })
    };

  } catch (err) {
    console.error("create-guided-user failure:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}

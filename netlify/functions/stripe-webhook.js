import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getRawBody(event) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf8");
  }
  return event.body;
}

export async function handler(event) {
  const sig = event.headers["stripe-signature"];
  if (!sig) {
    return { statusCode: 400, body: "Missing signature" };
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Signature error:", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "Ignored" };
  }

  try {
    const session = stripeEvent.data.object;

    const email =
      session.customer_details?.email || session.customer_email;
    const stripeCustomerId = session.customer;

    if (!email || !stripeCustomerId) {
      throw new Error("Missing email or Stripe customer ID");
    }

    /* -------------------------------------------------
       1️⃣ INSERT USER IF NOT EXISTS (NO OVERWRITES)
    -------------------------------------------------- */

    await supabase
      .from("guided_users")
      .insert({
        email,
        program: "guided_foundations",
        status: "active",
        stripe_customer_id: stripeCustomerId,

        user_state: "bt",
        bt_queue: ["hd-01-welcome.html"],

        phase: "hydration",
        current_module: "hydration",
        last_sent_at: null
      })
      .onConflict("stripe_customer_id")
      .ignore();

    /* -------------------------------------------------
       2️⃣ LOAD USER
    -------------------------------------------------- */

    const { data: user, error } = await supabase
      .from("guided_users")
      .select("id, bt_queue")
      .eq("stripe_customer_id", stripeCustomerId)
      .single();

    if (error || !user) {
      throw new Error("User lookup failed");
    }

    /* -------------------------------------------------
       3️⃣ INITIALIZE QUEUE ONLY IF EMPTY
    -------------------------------------------------- */

    if (!user.bt_queue || user.bt_queue.length === 0) {
      await supabase
        .from("guided_users")
        .update({
          bt_queue: ["hd-01-welcome.html"]
        })
        .eq("id", user.id);
    }

    /* -------------------------------------------------
       4️⃣ TRIGGER EMAIL ENGINE
    -------------------------------------------------- */

    await fetch(`${process.env.SITE_URL}/.netlify/functions/send_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id
      })
    });

    return { statusCode: 200, body: "ok" };

  } catch (err) {
    console.error("Webhook failure:", err);
    return { statusCode: 500, body: "Webhook error" };
  }
}

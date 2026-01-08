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

    await supabase
      .from("guided_users")
      .upsert(
        {
          email,
          program: "guided_foundations",
          status: "active",
          stripe_customer_id: stripeCustomerId,
          current_email: "hd-01-welcome.html",
          current_module: "hydration"
        },
        { onConflict: "stripe_customer_id" }
      );

    return { statusCode: 200, body: "ok" };

  } catch (err) {
    console.error("Webhook failure:", err);
    return { statusCode: 500, body: "Webhook error" };
  }
}

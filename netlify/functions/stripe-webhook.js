import Stripe from "stripe";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe REQUIRES raw body
function getRawBody(event) {
  return event.body;
}

export async function handler(event) {
  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

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
    console.error("Stripe signature error:", err.message);
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

    // 🔁 Call Supabase insert function
    const response = await fetch(
      `${process.env.SITE_URL}/.netlify/functions/create-guided-user`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          stripe_customer_id: stripeCustomerId
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("create-guided-user failed:", result);
      throw new Error("User creation failed");
    }

    // 🔔 Trigger email engine AFTER row exists
    await fetch(`${process.env.SITE_URL}/.netlify/functions/send_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: result.id })
    });

    return { statusCode: 200, body: "ok" };

  } catch (err) {
    console.error("Webhook failure:", err);
    return { statusCode: 500, body: "Webhook error" };
  }
}

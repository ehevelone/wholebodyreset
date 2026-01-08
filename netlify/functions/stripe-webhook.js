import Stripe from "stripe";
import fetch from "node-fetch";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler(event) {
  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) return { statusCode: 400, body: "Missing signature" };

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
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

  const session = stripeEvent.data.object;
  const email =
    session.customer_details?.email || session.customer_email;

  if (!email) {
    console.error("Stripe event missing email");
    return { statusCode: 400, body: "Missing email" };
  }

  // 🔔 REGISTER USER (fires email)
  await fetch(`${process.env.SITE_URL}/.netlify/functions/create-guided-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      source: "stripe"
    })
  });

  return { statusCode: 200, body: "ok" };
}

import Stripe from "stripe";
import fetch from "node-fetch";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// SAME canonical endpoint as backdoor + invite
const REGISTER_URL =
  "https://wholebodyreset.life/.netlify/functions/create-guided-user";

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
    console.error("Stripe signature error:", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  // Only care about successful checkout
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

  // 🔑 EXACT SAME POST AS BACKDOOR / INVITE
  await fetch(REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      source: "stripe"
    })
  });

  return { statusCode: 200, body: "ok" };
}

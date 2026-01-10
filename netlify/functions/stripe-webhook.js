const Stripe = require("stripe");
const { registerUser } = require("./registerUser.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) {
    return { statusCode: 400, body: "Missing signature" };
  }

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

  // Only act on successful checkout
  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "Ignored" };
  }

  const session = stripeEvent.data.object;
  const email =
    session.customer_details?.email || session.customer_email;

  if (!email) {
    return { statusCode: 400, body: "Missing email" };
  }

  // 🚀 START PROGRAM (SAME AS INVITE / BACKDOOR)
  await registerUser({ email });

  return {
    statusCode: 200,
    body: "ok"
  };
};

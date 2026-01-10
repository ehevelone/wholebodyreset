const Stripe = require("stripe");
const { registerUser } = require("./registerUser.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  // Stripe signature
  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) {
    console.error("WEBHOOK: Missing Stripe signature");
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
    console.error("WEBHOOK: Invalid signature", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  // Only process completed checkouts
  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "Ignored" };
  }

  const session = stripeEvent.data.object;

  const email =
    session.customer_details?.email ||
    session.customer_email;

  if (!email) {
    console.error("WEBHOOK: Missing email in session", session.id);
    return { statusCode: 400, body: "Missing email" };
  }

  console.log("WEBHOOK HIT checkout.session.completed:", email);

  try {
    // SAME ENGINE AS GENERATOR
    const result = await registerUser({ email });

    console.log("WEBHOOK DONE user_id:", result?.user_id);

    return {
      statusCode: 200,
      body: "ok"
    };
  } catch (err) {
    console.error("WEBHOOK registerUser ERROR:", err);
    return {
      statusCode: 500,
      body: "registerUser failed"
    };
  }
};

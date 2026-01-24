const Stripe = require("stripe");
const { registerUser } = require("./registerUser.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) {
    console.error("WEBHOOK: Missing Stripe signature");
    return { statusCode: 400, body: "Missing signature" };
  }

  let stripeEvent;
  try {
    // 🔴 THIS IS THE CRITICAL FIX
    stripeEvent = stripe.webhooks.constructEvent(
      event.body, // MUST be raw body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("WEBHOOK: Invalid signature", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "Ignored" };
  }

  const session = stripeEvent.data.object;

  let email =
    session.customer_details?.email ||
    session.customer_email;

  if (!email && session.customer) {
    const customer = await stripe.customers.retrieve(session.customer);
    email = customer.email;
  }

  const product = session.metadata?.product;

  if (!email || !product) {
    console.error("WEBHOOK: Missing email or product", { email, product });
    return { statusCode: 400, body: "Missing email or product" };
  }

  console.log("WEBHOOK OK:", email, product);

  await registerUser({ email, product });

  return {
    statusCode: 200,
    body: "ok"
  };
};

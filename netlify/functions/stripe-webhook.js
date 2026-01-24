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
    // 🔥 THIS IS THE CRITICAL FIX
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body, "utf8");

    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("WEBHOOK: Signature verification failed", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "Ignored" };
  }

  const session = stripeEvent.data.object;

  // Email
  let email =
    session.customer_details?.email ||
    session.customer_email;

  if (!email && session.customer) {
    try {
      const customer = await stripe.customers.retrieve(session.customer);
      email = customer.email;
    } catch (err) {
      console.error("WEBHOOK: Failed to retrieve customer", err);
    }
  }

  // Product
  const product = session.metadata?.product;

  if (!email || !product) {
    console.error("WEBHOOK: Missing email or product", {
      email,
      product,
      metadata: session.metadata
    });
    return { statusCode: 400, body: "Missing email or product" };
  }

  console.log("WEBHOOK OK:", email, product);

  try {
    await registerUser({ email, product });
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("WEBHOOK registerUser ERROR:", err);
    return { statusCode: 500, body: "registerUser failed" };
  }
};

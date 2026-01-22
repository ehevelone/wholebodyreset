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

  // ✅ EMAIL (unchanged)
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

  // ✅ PRODUCT (THIS WAS MISSING)
  const product = session.metadata?.product;

  if (!email || !product) {
    console.error("WEBHOOK: Missing email or product", {
      email,
      product,
      metadata: session.metadata
    });
    return { statusCode: 400, body: "Missing email or product" };
  }

  console.log(
    "WEBHOOK checkout.session.completed:",
    email,
    "product:",
    product
  );

  try {
    // ✅ PASS PRODUCT THROUGH
    const result = await registerUser({
      email,
      product
    });

    console.log("WEBHOOK DONE user_id:", result?.user_id, "program:", result?.program);

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

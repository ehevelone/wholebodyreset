exports.config = {
  bodyParser: false
};

const Stripe = require("stripe");
const { registerUser } = require("./registerUser.js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  // 🔥 ABSOLUTE PROOF THIS FILE RAN
  console.log("🔥 WEBHOOK HIT");

  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) {
    console.error("❌ Missing Stripe signature");
    return { statusCode: 200, body: "no signature" };
  }

  let stripeEvent;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Signature failed:", err.message);
    return { statusCode: 200, body: "bad signature" };
  }

  console.log("✅ EVENT TYPE:", stripeEvent.type);

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "ignored" };
  }

  const session = stripeEvent.data.object;

  let email =
    session.customer_details?.email ||
    session.customer_email;

  if (!email && session.customer) {
    try {
      const customer = await stripe.customers.retrieve(session.customer);
      email = customer.email;
    } catch (e) {
      console.error("❌ Failed to load customer");
    }
  }

  const product = session.metadata?.product;

  console.log("📧 EMAIL:", email);
  console.log("📦 PRODUCT:", product);

  if (!email || !product) {
    console.error("❌ Missing email or product");
    return { statusCode: 200, body: "missing data" };
  }

  try {
    // ✅ ALWAYS create / update SB user
    await registerUser({ email, product });
    console.log("✅ registerUser completed");

    // 📘 BOOK — trigger download
    if (product === "book") {
      fetch(
        `https://wholebodyreset.life/.netlify/functions/download-book?session_id=${session.id}`
      )
        .then(() => console.log("📘 download-book triggered"))
        .catch((e) =>
          console.error("❌ download-book call failed", e)
        );
    }

    // 🧭 GUIDED — welcome email + SB already handled by registerUser
    if (product === "guided") {
      console.log("📨 Guided purchase confirmed — welcome sequence should fire");
      // If welcome emails are handled inside registerUser, nothing else is needed here
    }

    // 🤖 AI — record purchase only (no download)
    if (product === "ai") {
      console.log("🤖 AI purchase recorded");
    }

  } catch (err) {
    console.error("❌ Post-checkout handling failed", err);
    // DO NOT fail Stripe
  }

  return {
    statusCode: 200,
    body: "ok"
  };
};

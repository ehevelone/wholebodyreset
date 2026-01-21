import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler(event) {
  const product = event.queryStringParameters?.product;

  let line_items;
  let mode = "payment";

  // 📘 Foundations Book — one-time
  if (product === "book") {
    line_items = [
      {
        price: "price_1Ss9UdK1BEhnYxA8Oc8I40Kz"
      }
    ];
  }

  // 🌿 Guided Foundations — subscription
  else if (product === "guided") {
    mode = "subscription";
    line_items = [
      {
        price: "price_1SphwPK1BEhnYxA8i5GJHo25"
      }
    ];
  }

  // 🤖 AI-Guided Foundations — subscription
  else if (product === "ai") {
    mode = "subscription";
    line_items = [
      {
        price: "price_1SphaYK1BEhnYxA8JUcpnN1R"
      }
    ];
  }

  else {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid product" })
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode,
    customer_creation: "always",
    line_items,

    metadata: {
      product
    },

    success_url: "https://wholebodyreset.life/?stripe=success",
    cancel_url: "https://wholebodyreset.life/?stripe=cancel"
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url })
  };
}

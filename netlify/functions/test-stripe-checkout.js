import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler(event) {
  const product = event.queryStringParameters?.product;

  let line_items;
  let mode = "payment";

  if (product === "book") {
    line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Foundations Book" },
          unit_amount: 999
        },
        quantity: 1
      }
    ];
  } else if (product === "guided") {
    line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Guided Foundations" },
          unit_amount: 2999
        },
        quantity: 1
      }
    ];
  } else {
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

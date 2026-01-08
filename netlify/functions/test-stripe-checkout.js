import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler() {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",

    // IMPORTANT: attach a Stripe customer
    customer_creation: "always",

    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Guided Foundations" },
          unit_amount: 100,
        },
        quantity: 1
      }
    ],

    metadata: {
      program: "guided_foundations"
    },

    success_url: "https://wholebodyreset.life/?stripe=success",
    cancel_url: "https://wholebodyreset.life/?stripe=cancel"
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url })
  };
}

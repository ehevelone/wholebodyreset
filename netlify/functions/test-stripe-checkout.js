import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler() {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Sandbox Webhook Test" },
          unit_amount: 100,
        },
        quantity: 1
      }
    ],
    success_url: "https://wholebodyreset.life/?stripe_test=success",
    cancel_url: "https://wholebodyreset.life/?stripe_test=cancel"
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url })
  };
}

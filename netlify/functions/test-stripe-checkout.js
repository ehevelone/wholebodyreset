const Stripe = require("stripe");

exports.handler = async () => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Sandbox Webhook Test" },
          unit_amount: 100
        },
        quantity: 1
      }
    ],
    success_url: `${process.env.SITE_URL}/?stripe_test=success`,
    cancel_url: `${process.env.SITE_URL}/?stripe_test=cancel`,
    customer_email: "ehevelone+stripe_test@gmail.com"
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url })
  };
};

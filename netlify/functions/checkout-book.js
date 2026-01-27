import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler() {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_creation: "always",

    line_items: [
      {
        price: "price_1Ss9UdK1BEhnYxA80c8I40Kz",
        quantity: 1
      }
    ],

    success_url: "https://wholebodyreset.life/book/bd-book-9f2a.html?purchase=success",
    cancel_url: "https://wholebodyreset.life/?purchase=cancel"
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url })
  };
}

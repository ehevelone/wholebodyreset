import Stripe from "stripe";

export async function handler() {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [
        { price: "price_BOOK_ID", quantity: 1 }
      ],
      success_url:
        "https://wholebodyreset.life/gf/start?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:
        "https://wholebodyreset.life/?book=cancel"
    });

    return {
      statusCode: 303,
      headers: {
        Location: session.url
      }
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: err.message
    };
  }
}

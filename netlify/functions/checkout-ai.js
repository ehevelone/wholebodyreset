import Stripe from "stripe";

export async function handler() {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_creation: "always",

      line_items: [
        { price: "price_1SvO8r2dn43JKZxOpPqjwp8L", quantity: 1 }
      ],

      // 🔑 THIS IS THE FIX
      subscription_data: {
        metadata: {
          product: "ai"
        }
      },

      success_url:
        "https://wholebodyreset.life/ai/ui/index.html?session_id={CHECKOUT_SESSION_ID}&src=ai",
      cancel_url:
        "https://wholebodyreset.life/?ai=cancel"
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

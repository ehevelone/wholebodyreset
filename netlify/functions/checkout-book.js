import Stripe from "stripe";

export async function handler(event) {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ok: false, error: "Missing STRIPE_SECRET_KEY" })
      };
    }

    const stripe = new Stripe(key);

    // ✅ VERIFIED TEST PRICE ID
    const PRICE_ID = "price_1Ss9UdK1BEhnYxA8Oc8I40Kz";

    // 🔎 Sanity check (throws if invalid)
    await stripe.prices.retrieve(PRICE_ID);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [{ price: PRICE_ID, quantity: 1 }],

      success_url:
        "https://wholebodyreset.life/book/bd-book-9f2a-dl.html?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://wholebodyreset.life/?purchase=cancel"
    });

    console.log("Stripe session created:", session.id);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error("Checkout error:", err);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: false,
        message: err?.message || "unknown error",
        code: err?.code
      })
    };
  }
}

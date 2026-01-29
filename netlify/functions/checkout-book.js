import Stripe from "stripe";

export async function handler() {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: "Missing STRIPE_SECRET_KEY" })
      };
    }

    const stripe = new Stripe(key);

    // ✅ VERIFIED TEST PRICE ID
    const PRICE_ID = "price_1Ss9UdK1BEhnYxA8Oc8I40Kz";

    // 🔎 Sanity check
    await stripe.prices.retrieve(PRICE_ID);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [{ price: PRICE_ID, quantity: 1 }],

      // ✅ CORRECT REDIRECT (CODED FILE, TEMPLATE-COMPLIANT)
      success_url:
        "https://wholebodyreset.life/book/bd-book-9f2a-dl.html?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://wholebodyreset.life/?purchase=cancel"
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: err?.message || "unknown error",
        code: err?.code
      })
    };
  }
}

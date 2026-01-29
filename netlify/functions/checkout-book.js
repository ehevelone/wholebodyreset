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

    // ✅ Verified TEST price ID
    const PRICE_ID = "price_1Ss9UdK1BEhnYxA8Oc8I40Kz";

    // 🔎 Sanity check (confirms Stripe can see this price)
    const price = await stripe.prices.retrieve(PRICE_ID);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [{ price: PRICE_ID, quantity: 1 }],

      // ✅ DIRECT PDF DELIVERY (NO LOOP)
      success_url: "https://wholebodyreset.life/book/Whole-Body-Reset-Foundations.pdf",
      cancel_url: "https://wholebodyreset.life/?purchase=cancel"
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        used_price_id: PRICE_ID,
        found_price: price?.id,
        url: session.url
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: err?.message || "unknown error",
        type: err?.type,
        code: err?.code,
        param: err?.param
      })
    };
  }
}

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler(event) {
  const token = event.queryStringParameters?.token;

  if (!token) {
    return { statusCode: 401, body: "No token" };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(token);

    if (session.payment_status === "paid") {
      return {
        statusCode: 200,
        body: JSON.stringify({ access: "granted" })
      };
    }

    return { statusCode: 403, body: "Payment not complete" };

  } catch (err) {
    return { statusCode: 401, body: "Invalid token" };
  }
}

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  const sig = event.headers["stripe-signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: "Invalid signature" };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: "Ignored" };
  }

  try {
    const session = stripeEvent.data.object;
    const email = session.customer_email;

    if (!email) {
      throw new Error("Missing customer email");
    }

    // Stripe == invite verification equivalent
    const { data, error } = await supabase
      .from("guided_users")
      .upsert(
        {
          email,
          program: "guided_foundations",
          status: "active",
          current_email: "hd-01-welcome.html",
          current_module: "hydration"
        },
        { onConflict: "email" }
      )
      .select()
      .single();

    if (error) {
      console.error(error);
      throw error;
    }

    // Send welcome email
    await fetch(`${process.env.SITE_URL}/.netlify/functions/send_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        template: "hd-01-welcome.html"
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error("Stripe webhook failure:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false })
    };
  }
}

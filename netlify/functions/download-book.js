import Stripe from "stripe";
import fs from "fs";
import path from "path";

export async function handler(event) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const sessionId = event.queryStringParameters?.session_id;
    if (!sessionId) {
      return {
        statusCode: 400,
        body: "Missing session_id"
      };
    }

    // 🔎 Verify checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return {
        statusCode: 403,
        body: "Payment not completed"
      };
    }

    // 📄 Load PDF from private function directory
    const filePath = path.join(
      process.cwd(),
      "netlify",
      "functions",
      "assets",
      "Whole-Body-Reset-Foundations.pdf"
    );

    const fileBuffer = fs.readFileSync(filePath);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"Whole-Body-Reset-Foundations.pdf\"",
        "Cache-Control": "no-store"
      },
      body: fileBuffer.toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: err.message || "Server error"
    };
  }
}

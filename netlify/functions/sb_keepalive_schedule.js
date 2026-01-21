export const config = {
  schedule: "0 12 * * *" // once per day
};

export async function handler() {
  const res = await fetch(
    `${process.env.URL}/.netlify/functions/sb-keepalive`
  );

  return {
    statusCode: res.ok ? 200 : 500,
    body: "Keep-alive scheduled ping sent"
  };
}

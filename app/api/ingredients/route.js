export async function POST(request) {
  const { name } = await request.json();

  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `List the major shopping ingredients for the home-cooked family dinner "${name}". Reply with ONLY a JSON array of 4 to 7 short lowercase ingredient strings — no quantities, no prose, no markdown. Example: ["chicken thighs","peppers","rice"]`,
        },
      ],
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";

  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.length) {
      return Response.json({
        ingredients: arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 8),
      });
    }
  } catch {}

  return Response.json({ ingredients: null });
}

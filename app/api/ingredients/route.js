// Suggests the major shopping ingredients for a dish via the Vercel AI Gateway.
// Uses AI_GATEWAY_API_KEY if set, otherwise the deployment's own Vercel OIDC token.
// Any failure returns { ingredients: null } so the client falls back to its guesser.
export async function POST(request) {
  try {
    const { name } = await request.json();
    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!name || !token) return Response.json({ ingredients: null });

    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `List the major shopping ingredients for the home-cooked family dinner "${String(name).slice(0, 80)}". Reply with ONLY a JSON array of 4 to 7 short lowercase ingredient strings, no quantities, no prose, no markdown. Use British names (courgette, aubergine, coriander, minced beef). Example: ["chicken thighs","peppers","rice"]`,
          },
        ],
      }),
    });
    if (!res.ok) return Response.json({ ingredients: null });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/); // tolerate code fences or stray words
    const arr = match ? JSON.parse(match[0]) : null;
    if (Array.isArray(arr) && arr.length) {
      return Response.json({ ingredients: arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 8) });
    }
  } catch {}
  return Response.json({ ingredients: null });
}

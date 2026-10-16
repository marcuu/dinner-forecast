// Drafts the batch-prep steps for one dinner via the Vercel AI Gateway.
// Uses AI_GATEWAY_API_KEY if set, otherwise the deployment's own Vercel OIDC token.
// Any failure returns { tasks: null } so the client falls back to its own draft.
export async function POST(request) {
  try {
    const { name, ingredients = [] } = await request.json();
    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!name || !token) return Response.json({ tasks: null });

    const ings = (Array.isArray(ingredients) ? ingredients : []).slice(0, 12).map((x) => String(x).slice(0, 40)).join(", ");
    const prompt = `You are planning a Sunday batch-prep session for a UK family (2 adults, 1 toddler). Write the prep steps for the dinner "${String(name).slice(0, 80)}"${ings ? ` (ingredients: ${ings})` : ""}, for 4 portions.

Reply with ONLY a JSON array, no prose, no markdown. Each item is one of:
- a chopping task: {"kind":"chop","ingredient":"onion","qty":2,"unit":"","cut":"diced","text":"2 onions, diced"}
- a cooking task: {"kind":"cook","text":"Brown the beef in batches","minutes":15,"handsOff":false,"equip":"hob","stage":"base"}

Rules:
- One chop task per fresh ingredient that needs knife work (veg, raw meat). Skip tins, jars, spices, dairy, pasta, rice, bread. Use plain lowercase ingredient names that match the ingredient list, and a simple cut: diced, sliced, chopped, crushed, grated, cubed.
- qty is a number, unit is "", "g" or "kg".
- Cooking tasks in order. "stage":"base" is cooking that can be done ahead (browning, the sauce, slow cooking). "stage":"finish" is assembly or anything best done on the night (assembling a lasagne, rolling enchiladas).
- "handsOff":true for unattended time (slow cooker, oven, simmering), with "equip" one of "slow cooker", "oven", "hob". Slow cooker dishes: 6 to 8 hours on low (360 to 480 minutes).
- Never fish, turkey, tofu, chicken mince or chicken thighs (use chicken breast).
- British names (courgette, coriander, minced beef). At most 12 chop tasks and 6 cook tasks.`;

    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: "anthropic/claude-haiku-4-5", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return Response.json({ tasks: null });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/); // tolerate code fences or stray words
    const arr = match ? JSON.parse(match[0]) : null;
    if (Array.isArray(arr) && arr.length) return Response.json({ tasks: arr });
  } catch {}
  return Response.json({ tasks: null });
}

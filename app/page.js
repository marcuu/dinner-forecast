"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dices, Plus, Trash2, ChevronDown, ChevronRight, ListChecks, Check, Sparkles } from "lucide-react";
import { loadState, saveState } from "../lib/store";

/* ------------------------------------------------------------------ *
 *  THE HOLME VALLEY ALMANAC — Dinner Forecast
 *  A recency-weighted, day-of-week-conditioned predictor of the next
 *  seven dinners. Samples from what you actually eat (not the modal
 *  week), applies anti-repetition constraints, a small exploration
 *  term, and a modest, fully-tunable nudge toward balance.
 * ------------------------------------------------------------------ */

const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_INIT = ["M", "T", "W", "T", "F", "S", "S"];
const PROTEINS = ["", "chicken", "beef", "pork", "lamb", "fish", "seafood", "egg", "veg", "mixed"];
const CUISINES = ["", "british", "italian", "indian", "asian", "mexican", "mediterranean", "other"];

/* ---- lightweight keyword auto-tagger ---- */
function autoTag(name) {
  const n = name.toLowerCase();
  const has = (...ws) => ws.some((w) => n.includes(w));
  let protein = "";
  if (has("chicken", "poussin")) protein = "chicken";
  else if (has("beef", "bolognese", "steak", "mince", "burger", "chilli", "cottage")) protein = "beef";
  else if (has("sausage", "pork", "bacon", "gammon", "chop")) protein = "pork";
  else if (has("lamb", "shepherd")) protein = "lamb";
  else if (has("salmon", "cod", "haddock", "fish", "mackerel", "trout", "tuna", "sardine")) protein = "fish";
  else if (has("prawn", "shrimp", "scallop", "squid", "seafood")) protein = "seafood";
  else if (has("lentil", "dahl", "dal", "bean", "chickpea", "tofu", "veggie", "vegetable", "veg ")) protein = "veg";
  else if (has("egg", "frittata", "omelette", "shakshuka")) protein = "egg";

  let cuisine = "";
  if (has("curry", "dahl", "dal", "tikka", "masala", "biryani", "korma")) cuisine = "indian";
  else if (has("pasta", "bolognese", "risotto", "pizza", "lasagne", "carbonara", "gnocchi")) cuisine = "italian";
  else if (has("stir", "noodle", "ramen", "katsu", "teriyaki", "pad thai", "fried rice")) cuisine = "asian";
  else if (has("taco", "fajita", "burrito", "enchilada", "chilli", "quesadilla")) cuisine = "mexican";
  else if (has("roast", "pie", "mash", "bangers", "jacket", "chips", "stew", "casserole", "toad")) cuisine = "british";

  const isTreat = has("takeaway", "fakeaway", "pizza", "fish and chips", "fish & chips", "chippy", "chip shop", "burger", "indian takeaway", "chinese takeaway");
  const isOilyFish = has("salmon", "mackerel", "trout", "sardine", "herring");
  const hasVeg = has("traybake", "salad", "stir", "curry", "dahl", "dal", "veg", "greens", "roast", "chilli", "stew", "soup", "ratatouille") || protein === "veg";
  return { protein, cuisine, isTreat, isOilyFish, hasVeg };
}

/* ---- guess major ingredients from a dish name (deterministic fallback) ---- */
function guessIngredients(name) {
  const n = name.toLowerCase();
  const has = (...ws) => ws.some((w) => n.includes(w));
  const out = [];
  const add = (...xs) => xs.forEach((x) => x && !out.includes(x) && out.push(x));

  if (has("chicken")) add("chicken");
  if (has("beef", "bolognese", "steak", "mince", "cottage", "stroganoff", "ragù", "ragu", "goulash")) add("beef");
  if (has("sausage", "banger", "toad")) add("sausages");
  if (has("bacon", "gammon")) add("bacon");
  if (has("lamb", "shepherd", "rendang")) add("lamb");
  if (has("salmon", "cod", "haddock", "fish", "tuna", "mackerel")) add("fish");
  if (has("prawn", "shrimp", "seafood")) add("prawns");
  if (has("lentil", "dahl", "dal")) add("lentils");
  if (has("chickpea", "channa", "chana")) add("chickpeas");
  if (has("tofu")) add("tofu");
  if (has("paneer")) add("paneer");
  if (has("egg", "frittata", "omelette", "shakshuka")) add("eggs");
  if (has("mushroom")) add("mushrooms");

  if (has("curry", "tikka", "masala", "korma", "madras", "balti", "rendang", "dahl", "dal", "jalfrezi"))
    add("onion", "garlic", "ginger", "chopped tomatoes", "curry spices", "rice");
  if (has("lasagne", "lasagna")) add("lasagne sheets", "chopped tomatoes", "béchamel", "cheese");
  else if (has("pasta", "spaghetti", "bolognese", "carbonara", "ragù", "ragu", "penne", "tagliatelle"))
    add("pasta", "chopped tomatoes", "onion", "garlic", "parmesan");
  if (has("risotto")) add("arborio rice", "stock", "onion", "parmesan");
  if (has("pizza")) add("pizza bases", "passata", "mozzarella");
  if (has("stir", "noodle", "ramen", "pad", "chow mein")) add("noodles", "soy sauce", "garlic", "mixed veg");
  if (has("taco", "fajita", "burrito", "enchilada", "quesadilla")) add("tortillas", "peppers", "onion", "cheese", "salsa");
  if (has("burger")) add("buns", "lettuce", "tomato", "cheese");
  if (has("roast")) add("potatoes", "carrots", "gravy");
  if (has("pie") && !has("pizza")) add("pastry", "onion", "stock");
  if (has("traybake", "tray bake")) add("peppers", "red onion", "new potatoes", "olive oil", "herbs");
  if (has("casserole", "stew", "hotpot", "cassoulet")) add("onion", "carrots", "stock", "chopped tomatoes");
  if (has("salad")) add("salad leaves", "tomatoes", "cucumber", "dressing");
  if (has("jacket", "baked potato")) add("baking potatoes", "cheese", "butter");
  if (has("mash", "banger")) add("potatoes", "onion gravy", "peas");
  if (has("chilli", "chili")) add("kidney beans", "chopped tomatoes", "onion", "peppers", "rice");
  if (has("goulash")) add("paprika", "peppers", "onion");
  if (has("stroganoff")) add("mushrooms", "soured cream", "onion", "rice");
  if (has("meze", "mezze")) add("flatbreads", "hummus", "olives", "feta", "salad");

  if (out.length < 3) add("onion", "garlic");
  return out.slice(0, 8);
}

/* ---- ask the model for ingredients; falls back to the guesser on any error ---- */
async function aiIngredients(name) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `List the major shopping ingredients for the home-cooked family dinner "${name}". Reply with ONLY a JSON array of 4 to 7 short lowercase ingredient strings — no quantities, no prose, no markdown. Example: ["chicken thighs","peppers","rice"]`,
          },
        ],
      }),
    });
    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const arr = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (Array.isArray(arr) && arr.length) {
      return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
    }
    return null;
  } catch {
    return null;
  }
}

/* ---- seeded RNG (mulberry32) so re-rolls are reproducible per seed ---- */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(entries, rng) {
  // entries: [{id, w}], w > 0
  const total = entries.reduce((s, e) => s + e.w, 0);
  if (total <= 0) return entries.length ? entries[0].id : null;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}

/* ------------------------------ the engine ------------------------------ */
function generatePlan(library, weeks, params, seed, startDate) {
  const byId = Object.fromEntries(library.map((m) => [m.id, m]));
  const { halfLife, nudge, epsilon, repeatWindow } = params;
  if (!library.length) return [];

  const isFish = (m) => m && (m.protein === "fish" || m.protein === "seafood" || m.isOilyFish);
  const cold = weeks.length === 0; // a liked-list isn't day history
  const recency = (weeksAgo) => Math.pow(0.5, weeksAgo / Math.max(0.25, halfLife));

  // forecast a fixed Monday→Sunday week (startDate is that Monday)
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push({ date: d, dow: i }); // 0=Mon … 6=Sun
  }

  const rng = mulberry32(seed >>> 0);
  const plan = [];
  const placed = [];
  let treatsPlaced = 0;

  days.forEach((day) => {
    const dow = day.dow;

    // --- base distribution ---
    const base = {};
    let weeksWithData = 0;
    const rawCount = {};
    if (cold) {
      library.forEach((m) => {
        if (!isFish(m) && !m.isSkip) base[m.id] = 1; // uniform shuffle until there's history
      });
    } else {
      weeks.forEach((wk, w) => {
        const id = wk[dow];
        if (id && byId[id] && !isFish(byId[id])) {
          base[id] = (base[id] || 0) + recency(w + 1);
          rawCount[id] = (rawCount[id] || 0) + 1;
          weeksWithData++;
        }
      });
    }

    let fellBack = false;
    if (!cold && Object.keys(base).length === 0) {
      fellBack = true;
      weeks.forEach((wk, w) => {
        wk.forEach((id) => {
          if (id && byId[id] && !isFish(byId[id])) base[id] = (base[id] || 0) + recency(w + 1) * 0.5;
        });
      });
    }
    if (Object.keys(base).length === 0) {
      library.forEach((m) => {
        if (!isFish(m) && !m.isSkip) base[m.id] = 1;
      });
    }

    const histTop = Object.entries(base).sort((a, b) => b[1] - a[1])[0]?.[0];

    // --- modest normative tilt: veg lean + treat cap (no fish in this house) ---
    const tilted = {};
    Object.entries(base).forEach(([id, w]) => {
      const m = byId[id];
      if (m.isSkip) {
        tilted[id] = w;
        return;
      }
      let f = 1;
      if (m.hasVeg) f *= 1 + nudge * 0.3;
      if (m.isTreat && treatsPlaced >= 1) f *= 1 - nudge * 0.7;
      tilted[id] = w * f;
    });

    // --- anti-repetition (skip nights are exempt — they can recur) ---
    const prev = placed.length ? byId[placed[placed.length - 1]] : null;
    const recentWindow = placed.slice(-repeatWindow);
    const constrained = {};
    Object.entries(tilted).forEach(([id, w]) => {
      const m = byId[id];
      if (m.isSkip) {
        constrained[id] = w;
        return;
      }
      let f = 1;
      if (recentWindow.includes(id)) f *= 0.02;
      if (prev && prev.protein && m.protein && prev.protein === m.protein) f *= 0.35;
      if (prev && prev.cuisine && m.cuisine && prev.cuisine === m.cuisine) f *= 0.6;
      constrained[id] = Math.max(w * f, w * 1e-4);
    });

    // --- exploration ---
    let exploring = false;
    let pool = Object.entries(constrained).map(([id, w]) => ({ id, w }));
    if (!cold && rng() < epsilon) {
      const seen = new Set(Object.keys(base));
      const fresh = library.filter(
        (m) => !seen.has(m.id) && !recentWindow.includes(m.id) && !isFish(m) && !m.isSkip
      );
      if (fresh.length) {
        exploring = true;
        pool = fresh.map((m) => {
          let f = 1;
          if (m.hasVeg) f *= 1 + nudge * 0.3;
          if (m.isTreat && treatsPlaced >= 1) f *= 1 - nudge * 0.7;
          return { id: m.id, w: Math.max(f, 0.05) };
        });
      }
    }

    const chosenId = weightedPick(pool, rng);
    const chosen = byId[chosenId];

    const poolTotal = pool.reduce((s, e) => s + e.w, 0);
    const prob = poolTotal > 0 ? (pool.find((e) => e.id === chosenId)?.w || 0) / poolTotal : 0;

    const candTotal = Object.values(constrained).reduce((s, w) => s + w, 0) || 1;
    const candidates = Object.entries(constrained)
      .map(([id, w]) => ({ id, p: w / candTotal }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 4);

    let rationale;
    if (chosen.isSkip) rationale = "Skip night — leftovers, out, or fend for yourself";
    else if (cold) rationale = "Cold start — add week history to make this a real forecast";
    else if (exploring) rationale = "Exploration pick — widening the rotation";
    else if (fellBack) rationale = `No ${DAY_FULL[dow]} history yet — drawn from your overall rotation`;
    else if (rawCount[chosenId])
      rationale = `${rawCount[chosenId]} of the last ${weeksWithData} ${DAY_FULL[dow]}${weeksWithData === 1 ? "" : "s"}`;
    else rationale = "Variety pick — recent repeats steered the model elsewhere";

    const tilt = [];
    if (!exploring && !cold && !chosen.isSkip && nudge > 0.02) {
      if (byId[histTop]?.isTreat && !chosen.isTreat && treatsPlaced >= 1) tilt.push("second treat avoided");
      if (chosen.hasVeg && histTop !== chosenId) tilt.push("veg lean");
    }

    placed.push(chosenId);
    if (chosen.isTreat) treatsPlaced++;

    plan.push({ date: day.date, dow, mealId: chosenId, prob, candidates, rationale, tilt, exploring, cold, skip: chosen.isSkip });
  });

  return plan;
}

/* ----------------------------- your repertoire ----------------------------- *
 *  Your liked-meals list, deduped and tagged. No fish anywhere — Laura doesn't
 *  eat it. Seeded with six weeks of plausible history built from your answers:
 *  a dinner every night, Monday leaning pasta, Sunday roast, Friday treat,
 *  Saturday more involved. Tags and history are my guesses — overwrite the grid
 *  with what you really ate.
 *  cols: name, protein, cuisine, isTreat, hasVeg, isSkip
 * -------------------------------------------------------------------------- */
function seedData() {
  const rows = [
    ["Med Veg & Caprese Pasta", "veg", "italian", false, true, false],
    ["Homemade Pizza", "mixed", "italian", true, true, false],
    ["Mushroom Pasta", "veg", "italian", false, true, false],
    ["Meze", "veg", "mediterranean", false, true, false],
    ["Chilli", "beef", "mexican", false, true, false],
    ["Tacos", "beef", "mexican", false, true, false],
    ["Fajitas", "chicken", "mexican", false, true, false],
    ["Jacket Potatoes", "veg", "british", false, true, false],
    ["Cottage Pie", "beef", "british", false, true, false],
    ["Thai", "mixed", "asian", false, true, false],
    ["Sausage & Bean Casserole", "pork", "british", false, true, false],
    ["Bangers & Mash", "pork", "british", false, false, false],
    ["Ravioli", "veg", "italian", false, false, false],
    ["Lasagne", "beef", "italian", false, true, false],
    ["Bolognese", "beef", "italian", false, true, false],
    ["Risotto", "veg", "italian", false, true, false],
    ["Roast Dinner", "mixed", "british", false, true, false],
    ["Goulash", "beef", "other", false, true, false],
    ["Lamb Rendang", "lamb", "asian", false, true, false],
    ["Chicken Tikka Masala", "chicken", "indian", false, true, false],
    ["Beef Stroganoff", "beef", "other", false, true, false],
    ["Chicken Burgers", "chicken", "british", true, false, false],
    ["Chicken Pie", "chicken", "british", false, true, false],
    ["Beef Ragù", "beef", "italian", false, true, false],
    ["Chickpea & Spinach Curry (slow cooker)", "veg", "indian", false, true, false],
    ["Chicken & Veg Traybake", "chicken", "british", false, true, false],
  ];
  // major ingredients per dish (lentils folded into the bulked mince dishes)
  const ING = {
    "Med Veg & Caprese Pasta": ["pasta", "courgette", "peppers", "cherry tomatoes", "mozzarella", "basil", "olive oil"],
    "Homemade Pizza": ["pizza bases", "passata", "mozzarella", "toppings of choice"],
    "Mushroom Pasta": ["pasta", "mushrooms", "garlic", "crème fraîche", "parmesan"],
    "Meze": ["flatbreads", "hummus", "falafel", "olives", "feta", "salad", "tzatziki"],
    "Chilli": ["beef mince", "lentils", "kidney beans", "chopped tomatoes", "onion", "peppers", "rice"],
    "Tacos": ["beef mince", "taco shells", "tomatoes", "lettuce", "cheese", "salsa"],
    "Fajitas": ["chicken", "peppers", "onions", "tortillas", "fajita seasoning", "soured cream"],
    "Jacket Potatoes": ["baking potatoes", "baked beans", "cheese", "butter"],
    "Cottage Pie": ["beef mince", "lentils", "carrots", "peas", "onion", "potatoes"],
    "Thai": ["chicken", "green beans", "Thai basil", "chillies", "soy sauce", "rice"],
    "Sausage & Bean Casserole": ["sausages", "cannellini beans", "chopped tomatoes", "onion", "stock"],
    "Bangers & Mash": ["sausages", "potatoes", "onion gravy", "peas"],
    "Ravioli": ["fresh ravioli", "tomato sauce", "parmesan", "basil"],
    "Lasagne": ["beef mince", "lentils", "lasagne sheets", "chopped tomatoes", "béchamel", "cheese"],
    "Bolognese": ["beef mince", "lentils", "chopped tomatoes", "onion", "carrot", "garlic", "spaghetti"],
    "Risotto": ["arborio rice", "stock", "mushrooms", "peas", "parmesan", "onion"],
    "Roast Dinner": ["roasting joint", "potatoes", "carrots", "broccoli", "Yorkshire puddings", "gravy"],
    "Goulash": ["braising beef", "paprika", "peppers", "onion", "chopped tomatoes", "rice"],
    "Lamb Rendang": ["lamb", "shallots", "lemongrass", "ginger", "coconut milk", "rice"],
    "Chicken Tikka Masala": ["chicken", "tikka masala paste", "chopped tomatoes", "yogurt", "onion", "rice"],
    "Beef Stroganoff": ["beef strips", "mushrooms", "onion", "soured cream", "paprika", "rice"],
    "Chicken Burgers": ["chicken burgers", "buns", "lettuce", "cheese", "tomato"],
    "Chicken Pie": ["chicken", "leeks", "mushrooms", "cream", "puff pastry", "peas"],
    "Beef Ragù": ["braising beef", "lentils", "chopped tomatoes", "onion", "carrot", "celery", "pappardelle"],
    "Chickpea & Spinach Curry (slow cooker)": ["chickpeas", "spinach", "onion", "garlic", "ginger", "chopped tomatoes", "curry spices", "rice"],
    "Chicken & Veg Traybake": ["chicken thighs", "peppers", "courgette", "red onion", "new potatoes", "olive oil", "herbs"],
  };
  const lib = rows.map((r, i) => ({
    id: "m" + i,
    name: r[0],
    protein: r[1],
    cuisine: r[2],
    isTreat: r[3],
    hasVeg: r[4],
    isOilyFish: false,
    isSkip: r[5],
    ingredients: ING[r[0]] || [],
  }));
  const id = (name) => (lib.find((m) => m.name === name) || {}).id || "";
  // six weeks, newest first. cols: Mon Tue Wed Thu Fri Sat Sun
  // built from your answers: ~6 cooked + 1 skip, Monday pasta, Sunday roast,
  // Friday treat, Saturday more involved, slow-cooker midweek, Thursday the
  // usual skip night. Synthetic scaffolding — overwrite with what you ate.
  const weekNames = [
    ["Beef Ragù", "Thai", "Chicken & Veg Traybake", "Jacket Potatoes", "Homemade Pizza", "Lamb Rendang", "Roast Dinner"],
    ["Mushroom Pasta", "Bangers & Mash", "Beef Ragù", "Chicken Tikka Masala", "Chicken Burgers", "Beef Stroganoff", "Roast Dinner"],
    ["Lasagne", "Bangers & Mash", "Chickpea & Spinach Curry (slow cooker)", "Cottage Pie", "Fajitas", "Meze", "Roast Dinner"],
    ["Med Veg & Caprese Pasta", "Chicken & Veg Traybake", "Sausage & Bean Casserole", "Chilli", "Homemade Pizza", "Goulash", "Roast Dinner"],
    ["Ravioli", "Chicken Pie", "Mushroom Pasta", "Tacos", "Chicken Burgers", "Chicken Tikka Masala", "Roast Dinner"],
    ["Bolognese", "Chickpea & Spinach Curry (slow cooker)", "Jacket Potatoes", "Chicken Tikka Masala", "Homemade Pizza", "Lasagne", "Lamb Rendang"],
  ];
  const weeks = weekNames.map((wk) => wk.map((n) => id(n)));
  return { lib, weeks };
}

/* persistence lives in ../lib/store.js (Supabase-backed, single shared row) */

/* =============================== component =============================== */
export default function DinnerForecast() {
  const [tab, setTab] = useState("forecast");
  const [library, setLibrary] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [params, setParams] = useState({ halfLife: 3, nudge: 0.35, epsilon: 0.12, repeatWindow: 3 });
  const [seed, setSeed] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const [editMeal, setEditMeal] = useState(null);
  const [newMeal, setNewMeal] = useState("");
  const [overrides, setOverrides] = useState({}); // dayIndex -> mealId (manual swap)
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0); // weeks forward from this week (per confirm)
  const [confirmed, setConfirmed] = useState(false);
  const [suggesting, setSuggesting] = useState(null); // meal id currently fetching ingredients
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => mondayOfWeek(today, weekOffset), [today, weekOffset]);

  /* load once from Supabase; seed on first run */
  useEffect(() => {
    (async () => {
      const st = await loadState();
      if (st && Array.isArray(st.library) && st.library.length) {
        setLibrary(st.library);
        setWeeks(Array.isArray(st.weeks) ? st.weeks : []);
        if (st.params) setParams((p) => ({ ...p, ...st.params }));
      } else if (!(st && st.cleared)) {
        const { lib: el, weeks: ew } = seedData();
        setLibrary(el);
        setWeeks(ew);
        await saveState({ library: el, weeks: ew, params, cleared: false });
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* debounced save to Supabase, with a visible status */
  useEffect(() => {
    if (!loaded) return;
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      const ok = await saveState({ library, weeks, params, cleared: library.length === 0 });
      setSaveStatus(ok ? "saved" : "error");
    }, 600);
    return () => clearTimeout(t);
  }, [library, weeks, params, loaded]);

  const plan = useMemo(
    () => generatePlan(library, weeks, params, seed, weekStart),
    [library, weeks, params, seed, weekStart]
  );
  const byId = useMemo(() => Object.fromEntries(library.map((m) => [m.id, m])), [library]);

  /* manual swaps reset when you re-roll a fresh week */
  useEffect(() => {
    setOverrides({});
  }, [seed]);

  /* deduped shopping list across the 7 forecast dinners (respecting swaps) */
  const shoppingList = useMemo(() => {
    const seen = new Set();
    const out = [];
    plan.forEach((d, i) => {
      const m = byId[overrides[i] ?? d.mealId];
      (m?.ingredients || []).forEach((ing) => {
        const k = ing.trim().toLowerCase();
        if (k && !seen.has(k)) {
          seen.add(k);
          out.push(ing.trim());
        }
      });
    });
    return out;
  }, [plan, overrides, byId]);

  const copyList = useCallback(async () => {
    const text = shoppingList.map((x) => `- ${x}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false); // fall back to the selectable textarea
    }
  }, [shoppingList]);

  /* commit the current Mon–Sun plan (swaps included) as the most recent week,
     pushing older weeks down, then roll forward to plan the next week */
  const confirmWeek = useCallback(() => {
    if (!plan.length) return;
    const newWeek = plan.map((d, i) => overrides[i] ?? d.mealId);
    setWeeks((W) => [newWeek, ...W]);
    setWeekOffset((o) => o + 1);
    setOpenDay(null);
    setSeed((s) => s + 1); // fresh plan for next week; the [seed] effect clears swaps
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2400);
  }, [plan, overrides]);

  /* ---- library ops ---- */
  const addMeal = useCallback(() => {
    const name = newMeal.trim();
    if (!name) return;
    const t = autoTag(name);
    const isSkip = name.toLowerCase() === "skip";
    setLibrary((L) => [...L, { id: "m" + Date.now(), name, ...t, isSkip, ingredients: guessIngredients(name) }]);
    setNewMeal("");
  }, [newMeal]);

  const updateMeal = (id, patch) =>
    setLibrary((L) => L.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const suggestIngredients = async (m) => {
    setSuggesting(m.id);
    const ai = await aiIngredients(m.name);
    updateMeal(m.id, { ingredients: ai || guessIngredients(m.name) });
    setSuggesting(null);
  };

  const deleteMeal = (id) => {
    setLibrary((L) => L.filter((m) => m.id !== id));
    setWeeks((W) => W.map((wk) => wk.map((c) => (c === id ? "" : c))));
  };

  /* ---- weeks ops ---- */
  const addWeek = () => setWeeks((W) => [Array(7).fill(""), ...W]);
  const removeWeek = (i) => setWeeks((W) => W.filter((_, idx) => idx !== i));
  const setCell = (wi, di, val) =>
    setWeeks((W) => W.map((wk, i) => (i === wi ? wk.map((c, j) => (j === di ? val : c)) : wk)));

  const clearExample = async () => {
    setLibrary([]);
    setWeeks([]);
    setTab("library");
  };

  if (!loaded) return <div className="loading">Loading the almanac…</div>;

  const hasData = library.length > 0;

  return (
    <div className="dfc">
      <style>{CSS}</style>

      <header className="hd">
        <div className="eyebrow">THE HOLME VALLEY ALMANAC</div>
        <h1>Dinner Forecast</h1>
        <p className="sub">
          Seven nights, predicted from what you actually eat — recency-weighted, sampled rather than
          averaged, and nudged just a little toward balance.
        </p>
      </header>

      <nav className="tabs">
        <button className={tab === "forecast" ? "tab on" : "tab"} onClick={() => setTab("forecast")}>
          Forecast
        </button>
        <button className={tab === "history" ? "tab on" : "tab"} onClick={() => setTab("history")}>
          History
        </button>
        <button className={tab === "library" ? "tab on" : "tab"} onClick={() => setTab("library")}>
          Library
        </button>
        <span className={`save-status ${saveStatus}`}>
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
            ? "Saved ✓"
            : saveStatus === "error"
            ? "Couldn't save"
            : ""}
        </span>
      </nav>

      {tab === "forecast" && (
        <section className="panel">
          {!hasData ? (
            <div className="empty">
              <p>No history to forecast from yet.</p>
              <button className="btn" onClick={() => setTab("library")}>
                Add your dinners
              </button>
            </div>
          ) : (
            <>
              <div className="panel-head">
                <span className="range">
                  {plan.length
                    ? `${fmt(plan[0].date)} – ${fmt(plan[plan.length - 1].date)}`
                    : ""}
                </span>
                <div className="head-actions">
                  <button className="btn ghost" onClick={() => setShoppingOpen((s) => !s)}>
                    <ListChecks size={15} /> Shopping list
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setOverrides({});
                      setSeed((s) => s + 1);
                    }}
                  >
                    <Dices size={15} /> Re-roll
                  </button>
                  <button className="btn" onClick={confirmWeek}>
                    <Check size={15} /> Confirm week
                  </button>
                </div>
              </div>

              {confirmed && (
                <div className="confirmed-note">
                  Logged as last week — older weeks pushed down, now planning the week of{" "}
                  {fmtDM(weekStart)}.
                </div>
              )}

              {shoppingOpen && (
                <div className="shopping">
                  <div className="shopping-head">
                    <span>{shoppingList.length} ingredients across the week</span>
                    <button className="btn small" onClick={copyList}>
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    className="shopping-text"
                    readOnly
                    rows={Math.min(16, Math.max(4, shoppingList.length))}
                    value={shoppingList.map((x) => `- ${x}`).join("\n")}
                    onFocus={(e) => e.target.select()}
                  />
                  <div className="shopping-note">
                    Deduplicated across all seven dinners, reflecting any swaps. Tap Copy, or tap the
                    box to select all.
                  </div>
                </div>
              )}

              {weeks.length === 0 && (
                <div className="cold-note">
                  No week history yet — this is a shuffle of your library, not a forecast. Add some
                  weeks under History.
                </div>
              )}

              <ol className="ledger">
                {plan.map((d, i) => {
                  const did = overrides[i] ?? d.mealId;
                  const meal = byId[did];
                  const swapped = overrides[i] != null && overrides[i] !== d.mealId;
                  const open = openDay === i;
                  return (
                    <li
                      key={i}
                      className={`row${d.exploring ? " explore" : ""}${d.skip ? " skip" : ""}${
                        swapped ? " swapped" : ""
                      }`}
                    >
                      <button className="row-main" onClick={() => setOpenDay(open ? null : i)}>
                        <div className="row-day">
                          <span className="dow">{DAY_FULL[d.dow]}</span>
                          <span className="date">{fmtDM(d.date)}</span>
                        </div>
                        <div className="row-meal">
                          <div className="meal-line">
                            <span className="meal-name">{meal ? meal.name : "—"}</span>
                            {swapped ? (
                              <span className="prob your">your pick</span>
                            ) : (
                              <span className="prob">{Math.round(d.prob * 100)}%</span>
                            )}
                          </div>
                          <div className="bar">
                            <span style={{ width: `${swapped ? 100 : Math.max(4, d.prob * 100)}%` }} />
                          </div>
                          <div className="why">
                            <span>{swapped ? "Swapped in manually" : d.rationale}</span>
                            {!swapped &&
                              d.tilt.map((t) => (
                                <span key={t} className="tilt">
                                  {t}
                                </span>
                              ))}
                          </div>
                        </div>
                        <span className="chev">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      </button>
                      {open && (
                        <div className="dist">
                          <div className="swap-row">
                            <label className="swap-label">Swap dinner</label>
                            <select
                              className="swap-select"
                              value={did}
                              onChange={(e) => {
                                const v = e.target.value;
                                setOverrides((o) => {
                                  const next = { ...o };
                                  if (v === d.mealId) delete next[i];
                                  else next[i] = v;
                                  return next;
                                });
                              }}
                            >
                              {library.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                            {swapped && (
                              <button
                                className="revert"
                                onClick={() =>
                                  setOverrides((o) => {
                                    const n = { ...o };
                                    delete n[i];
                                    return n;
                                  })
                                }
                              >
                                revert
                              </button>
                            )}
                          </div>

                          {meal?.ingredients?.length > 0 && (
                            <div className="ings">
                              <div className="ings-label">Major ingredients</div>
                              <div className="ings-list">
                                {meal.ingredients.map((ing) => (
                                  <span key={ing} className="ing">
                                    {ing}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="dist-label">Model's distribution for this {DAY_FULL[d.dow]}</div>
                          {d.candidates.map((c) => (
                            <button
                              key={c.id}
                              className={c.id === did ? "cand picked" : "cand"}
                              onClick={() =>
                                setOverrides((o) => {
                                  const n = { ...o };
                                  if (c.id === d.mealId) delete n[i];
                                  else n[i] = c.id;
                                  return n;
                                })
                              }
                            >
                              <span className="cand-name">{byId[c.id]?.name || "—"}</span>
                              <span className="cand-bar">
                                <span style={{ width: `${Math.max(3, c.p * 100)}%` }} />
                              </span>
                              <span className="cand-p">{Math.round(c.p * 100)}%</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="controls">
                <div className="controls-title">Model</div>
                <Slider
                  label="Recent weeks weigh more"
                  hint={`Older weeks fade by half every ${params.halfLife} ${params.halfLife === 1 ? "week" : "weeks"}`}
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={params.halfLife}
                  onChange={(v) => setParams((p) => ({ ...p, halfLife: v }))}
                  fmt={(v) => `${v}w`}
                />
                <Slider
                  label="Gentle nudge toward balance"
                  hint={
                    params.nudge < 0.03
                      ? "Off — pure prediction"
                      : "Leans toward veg, and away from a second treat night"
                  }
                  min={0}
                  max={1}
                  step={0.05}
                  value={params.nudge}
                  onChange={(v) => setParams((p) => ({ ...p, nudge: v }))}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                />
                <Slider
                  label="Shake up the rotation"
                  hint="Chance of slotting in something you've not had lately"
                  min={0}
                  max={0.4}
                  step={0.02}
                  value={params.epsilon}
                  onChange={(v) => setParams((p) => ({ ...p, epsilon: v }))}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                />
                <Slider
                  label="Don't repeat a meal within"
                  hint="Days before a dinner can return"
                  min={0}
                  max={6}
                  step={1}
                  value={params.repeatWindow}
                  onChange={(v) => setParams((p) => ({ ...p, repeatWindow: v }))}
                  fmt={(v) => `${v}d`}
                />
              </div>
            </>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="panel">
          <div className="sec-head">
            <h2>Trailing weeks</h2>
            <button className="btn ghost" onClick={addWeek}>
              <Plus size={15} /> Week
            </button>
          </div>
          <p className="note">
            Newest week at the top. Fill in the dinners you actually had. More weeks sharpens the
            day-of-week pattern; the half-life control decides how fast old weeks stop counting.
          </p>

          <div className="grid-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th className="wk-h"></th>
                  {DAY_INIT.map((d, i) => (
                    <th key={i}>{d}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((wk, wi) => (
                  <tr key={wi}>
                    <td className="wk-label">{wi === 0 ? "last wk" : `${wi + 1} wks`}</td>
                    {wk.map((cell, di) => (
                      <td key={di}>
                        <select value={cell} onChange={(e) => setCell(wi, di, e.target.value)}>
                          <option value="">—</option>
                          {library.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td>
                      <button className="icon-btn" onClick={() => removeWeek(wi)} aria-label="Remove week">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!weeks.length && (
                  <tr>
                    <td colSpan={9} className="muted pad">
                      No weeks yet — add one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "library" && (
        <section className="panel">
          <div className="sec-head">
            <h2>Meal library</h2>
            <span className="muted">{library.length} dinners</span>
          </div>
          <p className="note">
            Each dinner is defined once here. Tap a dish to edit its tags (auto-guessed from the
            name, they drive the variety and balance logic) and its major ingredients (which feed the
            shopping list).
          </p>

          <div className="add-row">
            <input
              value={newMeal}
              placeholder="Add a dinner, e.g. Salmon traybake"
              onChange={(e) => setNewMeal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMeal()}
            />
            <button className="btn" onClick={addMeal}>
              <Plus size={15} /> Add
            </button>
          </div>

          <ul className="lib">
            {library.map((m) => (
              <li key={m.id} className="lib-row">
                <button className="lib-main" onClick={() => setEditMeal(editMeal === m.id ? null : m.id)}>
                  <span className="lib-name">{m.name}</span>
                  <span className="chips">
                    {m.protein && <span className="chip">{m.protein}</span>}
                    {m.cuisine && <span className="chip">{m.cuisine}</span>}
                    {m.hasVeg && <span className="chip veg">veg</span>}
                    {m.isOilyFish && <span className="chip fish">oily fish</span>}
                    {m.isTreat && <span className="chip treat">treat</span>}
                  </span>
                </button>
                <button className="icon-btn" onClick={() => deleteMeal(m.id)} aria-label="Delete meal">
                  <Trash2 size={15} />
                </button>
                {editMeal === m.id && (
                  <div className="meal-edit">
                    <label>
                      Protein
                      <select value={m.protein} onChange={(e) => updateMeal(m.id, { protein: e.target.value })}>
                        {PROTEINS.map((p) => (
                          <option key={p} value={p}>
                            {p || "—"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Cuisine
                      <select value={m.cuisine} onChange={(e) => updateMeal(m.id, { cuisine: e.target.value })}>
                        {CUISINES.map((c) => (
                          <option key={c} value={c}>
                            {c || "—"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="toggles">
                      <Toggle on={m.hasVeg} onClick={() => updateMeal(m.id, { hasVeg: !m.hasVeg })}>
                        has veg
                      </Toggle>
                      <Toggle on={m.isOilyFish} onClick={() => updateMeal(m.id, { isOilyFish: !m.isOilyFish })}>
                        oily fish
                      </Toggle>
                      <Toggle on={m.isTreat} onClick={() => updateMeal(m.id, { isTreat: !m.isTreat })}>
                        treat
                      </Toggle>
                    </div>
                    <label className="ings-edit">
                      <span className="ings-edit-top">
                        Major ingredients
                        <button
                          type="button"
                          className="suggest-btn"
                          disabled={suggesting === m.id}
                          onClick={() => suggestIngredients(m)}
                        >
                          <Sparkles size={12} /> {suggesting === m.id ? "Suggesting…" : "Suggest"}
                        </button>
                      </span>
                      <input
                        value={(m.ingredients || []).join(", ")}
                        placeholder="e.g. chicken, peppers, rice"
                        onChange={(e) =>
                          updateMeal(m.id, {
                            ingredients: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </li>
            ))}
            {!library.length && <li className="muted pad">No dinners yet — add a few above.</li>}
          </ul>

          {hasData && (
            <button className="btn danger ghost mt" onClick={clearExample}>
              Clear all meals &amp; weeks
            </button>
          )}
        </section>
      )}

      <footer className="ft">
        Forecast, not prescription. Numbers are the model's own confidence in each pick given your
        history, the constraints, and the nudge — not a claim about nutrition.
      </footer>
    </div>
  );
}

function fmt(d) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
}

function fmtDM(d) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace(/,/g, "");
}

// Monday of the week containing `today`, shifted forward by `offset` weeks.
function mondayOfWeek(today, offset) {
  const d = new Date(today);
  const back = (d.getDay() + 6) % 7; // Mon→0 … Sun→6
  d.setDate(d.getDate() - back + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function Slider({ label, hint, min, max, step, value, onChange, fmt }) {
  return (
    <div className="slider">
      <div className="slider-top">
        <span className="slider-label">{label}</span>
        <span className="slider-val">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="slider-hint">{hint}</div>
    </div>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button className={on ? "toggle on" : "toggle"} onClick={onClick}>
      {children}
    </button>
  );
}

/* ================================== css ================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');

.dfc{
  --ink:#16302B; --ink-soft:#4d5e57; --paper:#E7DFCD; --card:#F5EFE2;
  --amber:#C5732B; --amber-soft:#e7c39a; --sage:#6E8B6A; --clay:#A8472E; --line:#D7CBB3;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink);
  background:var(--paper); padding:22px 16px 40px; max-width:760px; margin:0 auto;
  min-height:100%; -webkit-font-smoothing:antialiased;
}
.dfc *{box-sizing:border-box;}
.loading{font-family:'Fraunces',serif;padding:60px;text-align:center;color:#16302B;}

.hd .eyebrow{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.22em;color:var(--amber);font-weight:700;}
.hd h1{font-family:'Fraunces',serif;font-weight:600;font-size:40px;line-height:1.02;margin:6px 0 8px;letter-spacing:-.01em;}
.hd .sub{font-size:14.5px;line-height:1.5;color:var(--ink-soft);max-width:54ch;margin:0;}

.tabs{display:flex;gap:6px;margin:22px 0 16px;border-bottom:1px solid var(--line);}
.tab{font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.04em;background:none;border:none;
  padding:10px 4px;margin-right:18px;color:var(--ink-soft);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}
.tab.on{color:var(--ink);border-bottom-color:var(--amber);font-weight:700;}
.save-status{margin-left:auto;align-self:center;font-family:'Space Mono',monospace;font-size:10.5px;letter-spacing:.04em;color:var(--ink-soft);padding-bottom:6px;}
.save-status.saved{color:var(--sage);}
.save-status.error{color:var(--clay);}
.save-status.saving{color:var(--ink-soft);}

.panel{}
.panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.range{font-family:'Space Mono',monospace;font-size:12.5px;letter-spacing:.04em;color:var(--ink-soft);}

.btn{font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;display:inline-flex;align-items:center;gap:6px;
  background:var(--ink);color:var(--card);border:none;border-radius:2px;padding:8px 13px;cursor:pointer;}
.btn:hover{background:#0e221e;}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--ink);}
.btn.ghost:hover{background:rgba(22,48,43,.06);}
.btn.danger{color:var(--clay);border-color:var(--clay);}
.btn.danger:hover{background:rgba(168,71,46,.07);}

.empty{text-align:center;padding:48px 0;color:var(--ink-soft);}
.empty p{margin-bottom:16px;}

/* ---- ledger (the signature) ---- */
.ledger{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:4px;overflow:hidden;background:var(--card);}
.row{border-bottom:1px solid var(--line);}
.row:last-child{border-bottom:none;}
.row.explore{background:linear-gradient(90deg,rgba(110,139,106,.10),transparent 60%);}
.row.skip .meal-name{color:var(--ink-soft);font-style:italic;}
.row.skip .bar>span{background:var(--ink-soft);opacity:.35;}
.cold-note{font-size:12.5px;line-height:1.45;background:rgba(197,115,43,.10);border:1px solid var(--amber-soft);color:#7a4a1e;padding:9px 12px;border-radius:3px;margin-bottom:12px;}
.confirmed-note{font-size:12.5px;line-height:1.45;background:rgba(110,139,106,.14);border:1px solid var(--sage);color:#3f5a3b;padding:9px 12px;border-radius:3px;margin-bottom:12px;}
.row-main{width:100%;display:flex;align-items:flex-start;gap:14px;padding:14px 14px;background:none;border:none;text-align:left;cursor:pointer;}
.row-day{flex:0 0 78px;padding-top:1px;}
.row-day .dow{font-family:'Fraunces',serif;font-size:16px;font-weight:600;display:block;line-height:1.1;}
.row-day .date{font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-soft);letter-spacing:.02em;}
.row-meal{flex:1;min-width:0;}
.meal-line{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
.meal-name{font-size:16px;font-weight:600;color:var(--ink);}
.prob{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--amber);}
.bar{height:6px;background:rgba(22,48,43,.08);border-radius:3px;margin:7px 0 7px;overflow:hidden;}
.bar>span{display:block;height:100%;background:var(--amber);border-radius:3px;transition:width .5s cubic-bezier(.2,.7,.2,1);}
.why{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-soft);}
.tilt{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.03em;background:rgba(110,139,106,.18);color:#3f5a3b;padding:2px 6px;border-radius:2px;}
.chev{flex:0 0 16px;color:var(--ink-soft);padding-top:2px;}

.dist{padding:2px 14px 14px 106px;background:rgba(22,48,43,.025);}
.dist-label{font-family:'Space Mono',monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);margin:6px 0 8px;}
.cand{display:flex;align-items:center;gap:10px;margin-bottom:5px;width:100%;background:none;border:none;padding:3px 4px;border-radius:3px;cursor:pointer;text-align:left;}
.cand:hover{background:rgba(22,48,43,.05);}
.cand-name{flex:0 0 130px;font-size:12.5px;color:var(--ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cand.picked .cand-name{color:var(--ink);font-weight:600;}
.cand-bar{flex:1;height:5px;background:rgba(22,48,43,.07);border-radius:3px;overflow:hidden;}
.cand-bar>span{display:block;height:100%;background:var(--amber-soft);}
.cand.picked .cand-bar>span{background:var(--amber);}
.cand-p{flex:0 0 34px;text-align:right;font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-soft);}

/* ---- header actions + shopping list ---- */
.head-actions{display:flex;gap:8px;flex-wrap:wrap;}
.btn.small{padding:5px 11px;font-size:12.5px;}
.shopping{border:1px solid var(--line);border-radius:4px;background:var(--card);padding:12px;margin-bottom:14px;}
.shopping-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;font-size:12.5px;color:var(--ink-soft);}
.shopping-text{width:100%;font-family:'Space Mono',monospace;font-size:12.5px;line-height:1.55;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:3px;padding:9px 11px;resize:vertical;}
.shopping-note{font-size:11.5px;color:var(--ink-soft);margin-top:7px;}

/* ---- swap + ingredients in the expanded day ---- */
.swap-row{display:flex;align-items:center;gap:9px;margin:2px 0 12px;}
.swap-label{font-family:'Space Mono',monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);}
.swap-select{flex:1;font-family:'Inter',sans-serif;font-size:13.5px;padding:7px 9px;border:1px solid var(--line);border-radius:3px;background:var(--paper);color:var(--ink);}
.revert{font-family:'Space Mono',monospace;font-size:11px;background:none;border:1px solid var(--line);border-radius:2px;color:var(--clay);padding:6px 9px;cursor:pointer;}
.ings{margin:0 0 12px;}
.ings-label{font-family:'Space Mono',monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:6px;}
.ings-list{display:flex;flex-wrap:wrap;gap:5px;}
.ing{font-size:12px;background:rgba(22,48,43,.06);color:var(--ink);padding:3px 9px;border-radius:999px;}
.row.swapped .meal-name{color:var(--amber);}
.prob.your{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.03em;color:var(--amber);text-transform:uppercase;}
.row.swapped .bar>span{background:var(--sage);}
.ings-edit{flex-basis:100%;text-transform:none!important;letter-spacing:0!important;}
.ings-edit-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.suggest-btn{display:inline-flex;align-items:center;gap:4px;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.03em;text-transform:none;background:var(--ink);color:var(--card);border:none;border-radius:2px;padding:4px 8px;cursor:pointer;}
.suggest-btn:hover{background:#0e221e;}
.suggest-btn:disabled{opacity:.55;cursor:default;}
.ings-edit input{font-family:'Inter',sans-serif;font-size:13px;padding:7px 9px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);width:100%;margin-top:4px;}

/* ---- controls ---- */
.controls{margin-top:24px;border-top:1px solid var(--line);padding-top:18px;}
.controls-title{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:14px;}
.slider{margin-bottom:18px;}
.slider-top{display:flex;justify-content:space-between;align-items:baseline;}
.slider-label{font-size:13.5px;font-weight:600;}
.slider-val{font-family:'Space Mono',monospace;font-size:12.5px;font-weight:700;color:var(--amber);}
.slider input[type=range]{width:100%;margin:8px 0 4px;accent-color:var(--ink);height:3px;}
.slider-hint{font-size:12px;color:var(--ink-soft);}

/* ---- history ---- */
.sec-head{display:flex;justify-content:space-between;align-items:center;}
.sec-head.mt{margin-top:30px;}
.sec-head h2{font-family:'Fraunces',serif;font-weight:600;font-size:21px;margin:0;}
.muted{color:var(--ink-soft);font-size:13px;}
.muted.pad{padding:14px;display:block;}
.note{font-size:13px;color:var(--ink-soft);line-height:1.5;margin:6px 0 14px;max-width:60ch;}

.add-row{display:flex;gap:8px;margin-bottom:14px;}
.add-row input{flex:1;font-family:'Inter',sans-serif;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:2px;background:var(--card);color:var(--ink);}
.add-row input:focus{outline:2px solid var(--amber);outline-offset:-1px;}

.lib{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:4px;background:var(--card);}
.lib-row{display:flex;align-items:center;border-bottom:1px solid var(--line);flex-wrap:wrap;}
.lib-row:last-child{border-bottom:none;}
.lib-main{flex:1;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  background:none;border:none;text-align:left;padding:11px 13px;cursor:pointer;color:var(--ink);}
.lib-name{font-size:14.5px;font-weight:500;}
.chips{display:flex;gap:5px;flex-wrap:wrap;}
.chip{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.02em;background:rgba(22,48,43,.07);color:var(--ink-soft);padding:2px 7px;border-radius:2px;}
.chip.veg{background:rgba(110,139,106,.18);color:#3f5a3b;}
.chip.fish{background:rgba(110,139,106,.28);color:#2f4a2c;}
.chip.treat{background:rgba(168,71,46,.14);color:var(--clay);}
.icon-btn{background:none;border:none;color:var(--ink-soft);cursor:pointer;padding:11px 12px;}
.icon-btn:hover{color:var(--clay);}

.meal-edit{flex-basis:100%;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;padding:0 13px 13px;}
.meal-edit label{font-size:11px;color:var(--ink-soft);display:flex;flex-direction:column;gap:4px;font-family:'Space Mono',monospace;letter-spacing:.04em;text-transform:uppercase;}
.meal-edit select{font-family:'Inter',sans-serif;font-size:13px;padding:6px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-transform:none;letter-spacing:0;}
.toggles{display:flex;gap:6px;}
.toggle{font-family:'Space Mono',monospace;font-size:11px;padding:6px 10px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink-soft);cursor:pointer;}
.toggle.on{background:var(--sage);color:#fff;border-color:var(--sage);}

.grid-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:4px;background:var(--card);}
.grid{border-collapse:collapse;width:100%;min-width:520px;}
.grid th{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:var(--ink-soft);padding:9px 4px;border-bottom:1px solid var(--line);}
.grid .wk-h{width:60px;}
.grid td{padding:5px 4px;border-bottom:1px solid var(--line);text-align:center;}
.grid tr:last-child td{border-bottom:none;}
.wk-label{font-family:'Space Mono',monospace;font-size:10.5px;color:var(--ink-soft);white-space:nowrap;padding-left:9px!important;text-align:left!important;}
.grid select{font-family:'Inter',sans-serif;font-size:11.5px;max-width:88px;width:100%;padding:5px 4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);}
.mt{margin-top:18px;}

.ft{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-soft);line-height:1.5;max-width:62ch;}

button:focus-visible, input:focus-visible, select:focus-visible{outline:2px solid var(--amber);outline-offset:1px;}

@media (max-width:520px){
  .hd h1{font-size:32px;}
  .row-day{flex:0 0 64px;}
  .dist{padding-left:78px;}
  .cand-name{flex-basis:96px;}
}
@media (prefers-reduced-motion:reduce){ .bar>span{transition:none;} }
`;

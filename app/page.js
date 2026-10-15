"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dices, Plus, Trash2, ChevronLeft, ChevronRight, Check, Sparkles, Lock, ShoppingBasket, MoreHorizontal } from "lucide-react";

/* Ocado has no public API: we deep-link into its search or a product page the household has linked. */
const OCADO_SEARCH = (term) => `https://www.ocado.com/search?q=${encodeURIComponent(term)}`;
const OCADO_PRODUCT = /^https:\/\/(www\.)?ocado\.com\/products\/[^\s]+$/i;
/* "onions" and "onion" are the same thing to buy */
const singular = (w) => (w.length > 4 && w.endsWith("oes") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const ingKey = (s) => s.trim().toLowerCase().replace(/\s+/g, " ").split(" ").map(singular).join(" ");
/* cupboard basics start in the cupboard check; one tap moves any of them back to the list */
const LIKELY_STAPLE = /\b(oil|salt|black pepper|spices?|seasoning|paprika|cumin|herbs?|stock|gravy|flour|sugar|vinegar|soy sauce|garlic|rice|pasta)\b/;
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
    const res = await fetch("/api/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (Array.isArray(data.ingredients) && data.ingredients.length) {
      return data.ingredients;
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
function generatePlan(library, weeks, params, seed, startDate, lockedMeals = {}) {
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

    // --- locked days: pin the meal and update tracking state, skip normal generation ---
    if (lockedMeals[dow] !== undefined) {
      const chosenId = lockedMeals[dow];
      const chosen = byId[chosenId];
      if (chosen) {
        placed.push(chosenId);
        if (chosen.isTreat) treatsPlaced++;
        plan.push({ date: day.date, dow, mealId: chosenId, prob: 1, candidates: [],
          rationale: "Locked", tilt: [], exploring: false, cold: false, skip: chosen.isSkip, locked: true });
        return;
      }
    }

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
    if (chosen.isSkip) rationale = "Night off: leftovers, eating out, or fend for yourself";
    else if (cold) rationale = "A shuffle until there's some history to learn from";
    else if (exploring) rationale = "Something you've not had lately";
    else if (fellBack) rationale = `No ${DAY_FULL[dow]} history yet, so picked from your usual dinners`;
    else if (rawCount[chosenId])
      rationale = `${rawCount[chosenId]} of the last ${weeksWithData} ${DAY_FULL[dow]}${weeksWithData === 1 ? "" : "s"}`;
    else rationale = "Picked for variety";

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
  const [tab, setTab] = useState("week"); // week | library | history | tune
  const [sel, setSel] = useState(null); // selected week key (YYYY-MM-DD Monday)
  const [menuOpen, setMenuOpen] = useState(false);
  const [library, setLibrary] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [params, setParams] = useState({ halfLife: 3, nudge: 0.35, epsilon: 0.12, repeatWindow: 3 });
  const [seed, setSeed] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const [editMeal, setEditMeal] = useState(null);
  const [newMeal, setNewMeal] = useState("");
  const [overrides, setOverrides] = useState({}); // dayIndex -> mealId (manual swap)
  const [lockedDays, setLockedDays] = useState({}); // dayIndex -> true (survives re-roll)
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [suggesting, setSuggesting] = useState(null); // meal id currently fetching ingredients
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [retroOverrides, setRetroOverrides] = useState({});
  const [showRetroConfirm, setShowRetroConfirm] = useState(false);
  const [retroConfirmed, setRetroConfirmed] = useState(false);
  const [plannedWeeks, setPlannedWeeks] = useState([]); // { weekMonday: "YYYY-MM-DD", meals: [7 ids] }[]
  const [products, setProducts] = useState({}); // ingredient key -> { url?: Ocado product link, staple?: true }
  const [shop, setShop] = useState({}); // week key -> ingredient keys already in the Ocado basket
  const [linking, setLinking] = useState(null); // ingredient key being linked to an Ocado product
  const [linkDraft, setLinkDraft] = useState("");

  const today = useMemo(() => new Date(), []);
  const thisMonday = useMemo(() => mondayOfWeek(today, 0), [today]);
  /* planned weeks by Monday; the forecast ("draft") week is the first Monday from this week on that isn't planned */
  const plannedByKey = useMemo(() => {
    const out = {};
    plannedWeeks.forEach((p, idx) => { out[isoLocal(normMonday(p.weekMonday))] = idx; });
    return out;
  }, [plannedWeeks]);
  const weekStart = useMemo(() => {
    const d = new Date(thisMonday);
    while (plannedByKey[isoLocal(d)] !== undefined) d.setDate(d.getDate() + 7);
    return d;
  }, [thisMonday, plannedByKey]);
  const retroWeekStart = useMemo(() => mondayOfWeek(today, -1), [today]);

  /* load once from Supabase; seed on first run */
  useEffect(() => {
    (async () => {
      const st = await loadState();
      if (st && Array.isArray(st.library) && st.library.length) {
        setLibrary(st.library);
        let hist = Array.isArray(st.weeks) ? st.weeks : [];
        let pw = Array.isArray(st.plannedWeeks) ? st.plannedWeeks : [];
        // Graduate any planned weeks whose Monday has already passed into history
        const thisMonday = mondayOfWeek(new Date(), 0);
        pw = pw.map((p) => ({ ...p, weekMonday: isoLocal(normMonday(p.weekMonday)) }));
        const graduating = pw.filter((p) => normMonday(p.weekMonday) < thisMonday);
        const remaining = pw.filter((p) => normMonday(p.weekMonday) >= thisMonday);
        if (graduating.length) {
          graduating.sort((a, b) => normMonday(a.weekMonday) - normMonday(b.weekMonday));
          hist = [...graduating.map((p) => p.meals).reverse(), ...hist];
        }
        setWeeks(hist);
        setPlannedWeeks(remaining);
        if (st.params) setParams((p) => ({ ...p, ...st.params }));
        if (st.products && typeof st.products === "object") setProducts(st.products);
        if (st.shop && Array.isArray(st.shop.ticked)) setShop(st.shop.week ? { [isoLocal(normMonday(st.shop.week))]: st.shop.ticked } : {});
        else if (st.shop && typeof st.shop === "object") setShop(st.shop);
      } else if (!(st && st.cleared)) {
        const { lib: el, weeks: ew } = seedData();
        setLibrary(el);
        setWeeks(ew);
        await saveState({ library: el, weeks: ew, params, plannedWeeks: [], cleared: false });
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
      const ok = await saveState({ library, weeks, params, plannedWeeks, products, shop, cleared: library.length === 0 });
      setSaveStatus(ok ? "saved" : "error");
    }, 600);
    return () => clearTimeout(t);
  }, [library, weeks, params, plannedWeeks, products, shop, loaded]);

  // meals pinned by the user — passed to the engine so anti-repetition stays correct
  const fixedMeals = useMemo(() => {
    const out = {};
    Object.keys(lockedDays).forEach((k) => {
      const i = parseInt(k);
      if (overrides[i] !== undefined) out[i] = overrides[i];
    });
    return out;
  }, [lockedDays, overrides]);

  const plan = useMemo(
    () => generatePlan(library, weeks, params, seed, weekStart, fixedMeals),
    [library, weeks, params, seed, weekStart, fixedMeals]
  );
  const retroPlan = useMemo(
    () => (library.length ? generatePlan(library, weeks, params, seed, retroWeekStart) : []),
    [library, weeks, params, seed, retroWeekStart]
  );
  const byId = useMemo(() => Object.fromEntries(library.map((m) => [m.id, m])), [library]);


  /* every week you can step through: logged past weeks, confirmed weeks, and the one being forecast */
  const weekList = useMemo(() => {
    const out = [];
    const nPast = Math.min(weeks.length, 12);
    for (let k = 0; k < nPast; k++) {
      const d = new Date(thisMonday);
      d.setDate(d.getDate() - 7 * (k + 1));
      out.push({ key: isoLocal(d), monday: d, kind: "past", idx: k });
    }
    plannedWeeks.forEach((p, idx) => {
      const d = normMonday(p.weekMonday);
      if (d >= thisMonday) out.push({ key: isoLocal(d), monday: d, kind: "planned", idx });
    });
    out.push({ key: isoLocal(weekStart), monday: weekStart, kind: "draft" });
    return out.sort((x, y) => x.monday - y.monday);
  }, [weeks.length, plannedWeeks, thisMonday, weekStart]);
  const sw = useMemo(() => {
    const byKey = weekList.find((w) => w.key === sel);
    return byKey || weekList.find((w) => w.key === isoLocal(thisMonday)) || weekList[weekList.length - 1];
  }, [weekList, sel, thisMonday]);
  const swPos = weekList.indexOf(sw);
  const swMeals = useMemo(() => {
    if (sw.kind === "draft") return plan.map((d, i) => overrides[i] ?? d.mealId);
    if (sw.kind === "planned") return plannedWeeks[sw.idx]?.meals || Array(7).fill("");
    return weeks[sw.idx] || Array(7).fill("");
  }, [sw, plan, overrides, plannedWeeks, weeks]);
  const swDates = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(sw.monday); d.setDate(d.getDate() + i); return d; }), [sw]);

  /* that week's ingredients, deduplicated, with which nights need them and how to find them on Ocado */
  const ticked = useMemo(() => new Set(shop[sw.key] || []), [shop, sw]);
  const basket = useMemo(() => {
    const map = new Map();
    swMeals.forEach((id, i) => {
      const m = byId[id];
      if (!m || m.isSkip) return;
      (m.ingredients || []).forEach((ing) => {
        const k = ingKey(ing);
        if (!k) return;
        if (!map.has(k)) map.set(k, { key: k, label: ing.trim(), days: [] });
        const it = map.get(k);
        if (!it.days.includes(i)) it.days.push(i);
      });
    });
    return [...map.values()].map((it) => {
      const p = products[it.key] || {};
      const staple = p.staple ?? LIKELY_STAPLE.test(it.key);
      return { ...it, url: p.url || "", staple, href: p.url || OCADO_SEARCH(it.label), got: ticked.has(it.key) };
    });
  }, [swMeals, byId, products, ticked]);
  const toBuy = basket.filter((x) => !x.staple);
  const cupboard = basket.filter((x) => x.staple);
  const nextToAdd = toBuy.find((x) => !x.got);
  const shoppingList = toBuy.map((x) => x.label);

  const setTick = useCallback((k, on) => {
    setShop((sh) => {
      const cur = new Set(sh[sw.key] || []);
      on ? cur.add(k) : cur.delete(k);
      return { ...sh, [sw.key]: [...cur] };
    });
  }, [sw]);
  const setProduct = (k, patch) =>
    setProducts((P) => {
      const n = { ...(P[k] || {}), ...patch };
      Object.keys(n).forEach((f) => (n[f] === undefined || n[f] === "") && delete n[f]); // keep staple:false, it overrides the default
      const out = { ...P };
      if (Object.keys(n).length) out[k] = n; else delete out[k];
      return out;
    });
  /* one tap per item: open it in the same Ocado tab and tick it off */
  const openNext = () => {
    if (!nextToAdd) return;
    window.open(nextToAdd.href, "ocado");
    setTick(nextToAdd.key, true);
  };
  const saveLink = (k) => {
    const v = linkDraft.trim();
    if (v && !OCADO_PRODUCT.test(v.split("?")[0])) return;
    setProduct(k, { url: v ? v.split("?")[0] : "" });
    setLinking(null);
    setLinkDraft("");
  };

  const copyList = useCallback(async () => {
    const text = shoppingList.map((x) => `- ${x}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [shoppingList]);

  /* commit the current Mon–Sun plan (swaps included) as the most recent week,
     pushing older weeks down, then roll forward to plan the next week */
  const confirmWeek = useCallback(() => {
    if (!plan.length) return;
    const weekMonday = isoLocal(weekStart);
    const meals = plan.map((d, i) => overrides[i] ?? d.mealId);
    setPlannedWeeks((pw) => [...pw, { weekMonday, meals }]);
    setSel(weekMonday);
    setOpenDay(null);
    setOverrides({});
    setLockedDays({});
    setSeed((s) => s + 1);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2400);
  }, [plan, overrides, weekStart]);

  const confirmRetroWeek = useCallback(() => {
    if (!retroPlan.length) return;
    const newWeek = retroPlan.map((d, i) => retroOverrides[i] ?? d.mealId);
    setWeeks((W) => [newWeek, ...W]);
    setShowRetroConfirm(false);
    setRetroOverrides({});
    setRetroConfirmed(true);
    setTimeout(() => setRetroConfirmed(false), 2400);
  }, [retroPlan, retroOverrides]);
  /* toggle lock on a forecast day — locking pins the current meal through re-rolls;
     unlocking clears the pin and reverts to the engine's suggestion */
  const toggleLock = useCallback((i) => {
    if (lockedDays[i]) {
      setLockedDays((ld) => { const n = { ...ld }; delete n[i]; return n; });
      setOverrides((o) => { const n = { ...o }; delete n[i]; return n; });
    } else {
      const mealId = overrides[i] ?? plan[i]?.mealId;
      if (mealId) {
        setOverrides((o) => ({ ...o, [i]: mealId }));
        setLockedDays((ld) => ({ ...ld, [i]: true }));
      }
    }
  }, [lockedDays, overrides, plan]);

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

  /* ---- planned weeks ops ---- */
  const setPlannedCell = (wi, di, val) =>
    setPlannedWeeks((pw) => pw.map((wk, i) =>
      i === wi ? { ...wk, meals: wk.meals.map((m, j) => (j === di ? val : m)) } : wk
    ));
  const removePlannedWeek = (wi) =>
    setPlannedWeeks((pw) => pw.filter((_, i) => i !== wi));

  const clearExample = async () => {
    setLibrary([]);
    setWeeks([]);
    setPlannedWeeks([]);
    setTab("library");
  };
  const unplanWeek = (idx) => { removePlannedWeek(idx); setOpenDay(null); };

  if (!loaded) return <div className="loading">Loading the almanac…</div>;

  const hasData = library.length > 0;

  const inBasket = toBuy.filter((x) => x.got).length;
  const reroll = () => {
    setOverrides((o) => {
      const next = {};
      Object.keys(lockedDays).forEach((k) => {
        const i = parseInt(k);
        if (o[i] !== undefined) next[i] = o[i];
      });
      return next;
    });
    setSeed((s) => s + 1);
  };
  /* change one night of the selected week, whichever kind of week it is */
  const setNight = (i, id) => {
    if (sw.kind === "draft") {
      const d = plan[i];
      setOverrides((o) => {
        const n = { ...o };
        if (d && id === d.mealId) delete n[i];
        else n[i] = id;
        return n;
      });
    } else if (sw.kind === "planned") setPlannedCell(sw.idx, i, id);
    else setCell(sw.idx, i, id);
  };
  const go = (pos) => { const w = weekList[pos]; if (w) { setSel(w.key); setOpenDay(null); setLinking(null); } };
  const openPage = (t) => { setTab(t); setMenuOpen(false); window.scrollTo(0, 0); };
  const STATUS = { past: "What you ate", planned: "Confirmed", draft: "Forecast. Swap anything, then confirm" };
  const range = `${fmt(swDates[0])} to ${fmt(swDates[6])}`;
  const PAGE = { library: "Meals", history: "Past weeks", tune: "Tune the forecast" };

  return (
    <div className="dfc">
      <style>{CSS}</style>

      <div className="topbar">
        {tab !== "week" ? (
          <button className="backBtn" onClick={() => openPage("week")}>
            <ChevronLeft size={20} /> {weekName(sw.monday, thisMonday)}
          </button>
        ) : (
          <span />
        )}
        <div className="menuWrap">
          <button className="menuBtn" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={() => openPage("library")}>Meals</button>
              <button role="menuitem" onClick={() => openPage("history")}>Past weeks</button>
              <button role="menuitem" onClick={() => openPage("tune")}>Tune the forecast</button>
            </div>
          )}
        </div>
      </div>

      <div className="wrap" onClick={() => menuOpen && setMenuOpen(false)}>
      {tab === "week" && (
        <>
          <header className="weekHead">
            <div className="weekTitle">
              <h1 className="largeTitle">{weekName(sw.monday, thisMonday)}</h1>
              <p className="footnote">
                {range}. {STATUS[sw.kind]}
                {saveStatus === "error" && <span className="save-status error">. Couldn&rsquo;t save</span>}
              </p>
            </div>
            <div className="weekNav" role="group" aria-label="Choose week">
              <button aria-label="Previous week" disabled={swPos <= 0} onClick={() => go(swPos - 1)}><ChevronLeft size={20} /></button>
              <button aria-label="Next week" disabled={swPos >= weekList.length - 1} onClick={() => go(swPos + 1)}><ChevronRight size={20} /></button>
            </div>
          </header>

          {!hasData ? (
            <div className="empty">
              <p>Add the dinners you usually make, and the forecast starts from there.</p>
              <button className="btn primary" onClick={() => openPage("library")}>Add dinners</button>
            </div>
          ) : (
            <section className="panel">
              {confirmed && sw.kind === "planned" && (
                <div className="banner">
                  Week confirmed. Shop for it below, or{" "}
                  <button className="inlineLink" onClick={() => go(weekList.length - 1)}>plan the next one</button>.
                </div>
              )}
              {weeks.length === 0 && sw.kind === "draft" && (
                <p className="gf">No history yet, so this is a shuffle of your meals. Log a few weeks under Past weeks.</p>
              )}

              <h2 className="secTitle">Dinners</h2>
              <ul className="list days">
                {swMeals.map((id, i) => {
                  const meal = byId[id];
                  const d = sw.kind === "draft" ? plan[i] : null;
                  const open = openDay === i;
                  return (
                    <li key={i} className={open ? "open" : ""}>
                      <button className="li dayRow" aria-expanded={open} onClick={() => setOpenDay(open ? null : i)}>
                        <span className="dayCol">
                          <b>{DAY_FULL[i].slice(0, 3)}</b>
                          <small>{swDates[i].getDate()}</small>
                        </span>
                        <span className="lab">
                          <span className={meal ? "meal" : "meal empty"}>{meal ? meal.name : "Nothing planned"}</span>
                        </span>
                        {sw.kind === "draft" && lockedDays[i] && <Lock size={14} className="lockIc" aria-label="Kept" />}
                        <ChevronRight size={16} className="chev" />
                      </button>
                      {open && (
                        <div className="dayMore">
                          {d && (
                            <>
                              <p className="moreHead">Likely for {DAY_FULL[i]}</p>
                              <div className="alts">
                                {d.candidates.map((c) => (
                                  <button key={c.id} className={c.id === id ? "alt on" : "alt"} onClick={() => setNight(i, c.id)}>
                                    <span>{byId[c.id]?.name || "Nothing"}</span>
                                    <span className="pct">{Math.round(c.p * 100)}%</span>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          <label className="row2">
                            <span>{d ? "Something else" : "Change to"}</span>
                            <select value={id} onChange={(e) => setNight(i, e.target.value)}>
                              <option value="">Nothing planned</option>
                              {library.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </label>
                          {d && (
                            <label className="row2">
                              <span>Keep when re-rolling</span>
                              <span className="switch">
                                <input type="checkbox" role="switch" checked={!!lockedDays[i]} onChange={() => toggleLock(i)} />
                                <span />
                              </span>
                            </label>
                          )}
                          {meal?.ingredients?.length > 0 && <p className="ingsLine">Needs {meal.ingredients.join(", ")}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {sw.kind === "draft" && (
                <div className="actions">
                  <button className="btn" onClick={reroll}><Dices size={16} /> Re-roll</button>
                  <button className="btn primary" onClick={confirmWeek}><Check size={16} /> Confirm week</button>
                </div>
              )}
              {sw.kind === "planned" && (
                <div className="actions">
                  <button className="textBtn" onClick={() => unplanWeek(sw.idx)}>Go back to the forecast for this week</button>
                </div>
              )}

              {sw.kind !== "past" && (
                <>
                  <h2 className="secTitle">Shopping</h2>
                  {toBuy.length === 0 ? (
                    <p className="gf">Nothing to buy for these dinners.</p>
                  ) : (
                    <>
                      <div className="meterRow">
                        <span>{inBasket} of {toBuy.length} in your Ocado basket</span>
                        <div className="meter" aria-hidden="true"><i style={{ width: `${(inBasket / toBuy.length) * 100}%` }} /></div>
                      </div>
                      {nextToAdd ? (
                        <button className="btn primary wide" onClick={openNext}>
                          <ShoppingBasket size={17} /> Next on Ocado: {nextToAdd.label}
                        </button>
                      ) : (
                        <div className="banner">Everything&rsquo;s in the basket. Book a slot on Ocado and you&rsquo;re done.</div>
                      )}

                      <ul className="list basket">
                        {toBuy.map((it) => (
                          <li key={it.key} className={it.got ? "got" : ""}>
                            <div className="li">
                              <button
                                className="tick"
                                aria-pressed={it.got}
                                aria-label={`${it.label}: ${it.got ? "in basket" : "not in basket"}`}
                                onClick={() => setTick(it.key, !it.got)}
                              >
                                <Check size={14} />
                              </button>
                              <a className="lab" href={it.href} target="ocado" rel="noopener noreferrer" onClick={() => setTick(it.key, true)}>
                                <span className="meal">{it.label}</span>
                                <span className="sub">
                                  {it.days.map((x) => DAY_FULL[x].slice(0, 3)).join(", ")}
                                  {it.url ? ". Your usual product" : ""}
                                </span>
                              </a>
                              <button
                                className="more"
                                aria-expanded={linking === it.key}
                                aria-label={`Options for ${it.label}`}
                                onClick={() => { setLinking(linking === it.key ? null : it.key); setLinkDraft(it.url); }}
                              >
                                <MoreHorizontal size={18} />
                              </button>
                            </div>
                            {linking === it.key && (
                              <div className="itemMore">
                                <label className="linkRow">
                                  <span>Your usual Ocado product</span>
                                  <span className="linkField">
                                    <input
                                      autoFocus
                                      placeholder="Paste the product link"
                                      value={linkDraft}
                                      onChange={(e) => setLinkDraft(e.target.value)}
                                      onKeyDown={(e) => e.key === "Enter" && saveLink(it.key)}
                                    />
                                    <button className="btn small" onClick={() => saveLink(it.key)}>Save</button>
                                  </span>
                                </label>
                                {linkDraft.trim() && !OCADO_PRODUCT.test(linkDraft.trim().split("?")[0]) && (
                                  <span className="err">That isn&rsquo;t an Ocado product link.</span>
                                )}
                                <button className="textBtn" onClick={() => { setProduct(it.key, { staple: true }); setLinking(null); }}>
                                  We always have this
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {cupboard.length > 0 && (
                    <details className="group">
                      <summary className="gh">Check the cupboard ({cupboard.length})<ChevronRight size={14} className="chev" /></summary>
                      <ul className="list">
                        {cupboard.map((it) => (
                          <li key={it.key}>
                            <div className="li">
                              <span className="lab">
                                <span className="meal">{it.label}</span>
                                <span className="sub">{it.days.map((x) => DAY_FULL[x].slice(0, 3)).join(", ")}</span>
                              </span>
                              <button className="textBtn" onClick={() => setProduct(it.key, { staple: false })}>Add to list</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {toBuy.length > 0 && (
                    <div className="actions">
                      <button className="btn" onClick={copyList}>{copied ? "Copied" : "Copy list"}</button>
                    </div>
                  )}
                  <p className="gf">
                    Ocado doesn&rsquo;t let other apps fill your basket, so each item opens Ocado for you to add.
                    Paste your usual product link once (the ••• button) and it opens straight to it after that.
                  </p>
                </>
              )}
            </section>
          )}
        </>
      )}

      {tab !== "week" && (
        <header className="head">
          <h1 className="largeTitle">{PAGE[tab]}</h1>
        </header>
      )}

      {tab === "tune" && (
        <section className="panel">
          <div className="list padded">
            <Slider
              label="Recent weeks count more"
              hint={`Older weeks fade by half every ${params.halfLife} ${params.halfLife === 1 ? "week" : "weeks"}`}
              min={0.5} max={8} step={0.5} value={params.halfLife}
              onChange={(v) => setParams((p) => ({ ...p, halfLife: v }))}
              fmt={(v) => `${v} wk`}
            />
            <Slider
              label="Nudge towards balance"
              hint={params.nudge < 0.03 ? "Off: pure prediction" : "Leans towards veg, and away from a second treat night"}
              min={0} max={1} step={0.05} value={params.nudge}
              onChange={(v) => setParams((p) => ({ ...p, nudge: v }))}
              fmt={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="Try something different"
              hint="Chance of a dinner you've not had lately"
              min={0} max={0.4} step={0.02} value={params.epsilon}
              onChange={(v) => setParams((p) => ({ ...p, epsilon: v }))}
              fmt={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="Don't repeat within"
              hint="Days before a dinner can come back"
              min={0} max={6} step={1} value={params.repeatWindow}
              onChange={(v) => setParams((p) => ({ ...p, repeatWindow: v }))}
              fmt={(v) => `${v} ${v === 1 ? "day" : "days"}`}
            />
          </div>
          <p className="gf">These shape the forecast for the next week you haven&rsquo;t confirmed.</p>
        </section>
      )}

      {tab === "history" && (
        <section className="panel">
          {hasData && (
            <>
              <div className="sec-head">
                <h2>Last week</h2>
                {!showRetroConfirm && (
                  <button className="btn" onClick={() => setShowRetroConfirm(true)}>
                    <Plus size={15} /> Log last week
                  </button>
                )}
              </div>
              <p className="note">
                Filled in from the forecast. Fix any nights that were different, then confirm.
              </p>

              {retroConfirmed && (
                <div className="confirmed-note">
                  Last week logged. The forecast will learn from it.
                </div>
              )}

              {showRetroConfirm && (
                <div className="retro-confirm">
                  <div className="retro-range">
                    {retroPlan.length
                      ? `${fmt(retroPlan[0].date)} – ${fmt(retroPlan[retroPlan.length - 1].date)}`
                      : ""}
                  </div>
                  <ol className="retro-list">
                    {retroPlan.map((d, i) => {
                      const did = retroOverrides[i] ?? d.mealId;
                      return (
                        <li key={i} className="retro-row">
                          <div className="retro-day">
                            <span className="dow">{DAY_FULL[d.dow]}</span>
                            <span className="date">{fmtDM(d.date)}</span>
                          </div>
                          <select
                            className="retro-select"
                            value={did}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRetroOverrides((o) => {
                                const next = { ...o };
                                if (v === d.mealId) delete next[i];
                                else next[i] = v;
                                return next;
                              });
                            }}
                          >
                            <option value="">—</option>
                            {library.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="retro-actions">
                    <button className="btn cta" onClick={confirmRetroWeek}>
                      <Check size={15} /> Confirm last week
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setShowRetroConfirm(false);
                        setRetroOverrides({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className={`sec-head${hasData ? " mt" : ""}`}>
            <h2>Past weeks</h2>
            <button className="btn ghost" onClick={addWeek}>
              <Plus size={15} /> Add week
            </button>
          </div>
          <p className="note">
            Fix any night here. More weeks make the forecast sharper.
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
                      No weeks yet. Add one above.
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
          <p className="note">
            Tap a dinner to change its tags or ingredients. Tags keep the week varied; ingredients make the shop.
          </p>

          <div className="add-row">
            <input
              value={newMeal}
              placeholder="Add a dinner, e.g. Sausage traybake"
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
                    <label className="meal-edit-name">
                      Name
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) => updateMeal(m.id, { name: e.target.value })}
                      />
                    </label>
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

      </div>
    </div>
  );
}

/* dates as local YYYY-MM-DD (toISOString shifts to UTC and lands on Sunday during BST) */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/* the Monday a stored week key refers to; older keys were saved as the UTC Sunday before */
function normMonday(iso) {
  const d = new Date(iso + "T12:00:00");
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return mondayOfWeek(d, 0);
}
function weekName(monday, thisMonday) {
  const diff = Math.round((monday - thisMonday) / (7 * 86400000));
  if (diff === 0) return "This week";
  if (diff === 1) return "Next week";
  if (diff === -1) return "Last week";
  return `Week of ${fmtDM(monday)}`;
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
/* Apple HIG, matching the FIRE app: grouped backgrounds, inset lists, one floating glass tab bar.
   Accents from Sanzo Wada's Dictionary of Color Combinations: Antwarp Blue, Ochraceous Salmon, Sulphine Yellow. */
.dfc{
  --bg:#f2f2f7; --bg2:#ffffff; --bg3:#f2f2f7;
  --label:#000; --label2:rgba(60,60,67,.6); --label3:rgba(60,60,67,.3);
  --sep:rgba(60,60,67,.18); --fill:rgba(120,120,128,.16); --fill2:rgba(118,118,128,.12);
  --tint:rgb(0,113,144); --tintText:rgb(0,105,134); --onTint:#fff;
  --salmon:rgb(200,140,96); --sun:rgb(193,159,44); --moss:rgb(67,119,66); --green:rgb(52,199,89); --redText:rgb(233,21,45);
  --glass:rgba(255,255,255,.62); --glassEdge:rgba(255,255,255,.75); --glassShadow:0 10px 36px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);
  --sel:rgba(0,0,0,.06);
  --f:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro",system-ui,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --fd:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro",system-ui,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --fr:ui-rounded,"SF Pro Rounded",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  background:var(--bg); color:var(--label); font-family:var(--f); font-size:17px; line-height:22px; letter-spacing:-.01em;
  min-height:100vh; -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){.dfc{
  --bg:#000; --bg2:#1c1c1e; --bg3:#2c2c2e;
  --label:#fff; --label2:rgba(235,235,245,.6); --label3:rgba(235,235,245,.3);
  --sep:rgba(84,84,88,.6); --fill:rgba(120,120,128,.36); --fill2:rgba(118,118,128,.24);
  --tint:rgb(120,205,208); --tintText:rgb(120,205,208); --onTint:#06262b;
  --salmon:rgb(216,163,123); --sun:rgb(210,176,64); --moss:rgb(126,176,112); --green:rgb(48,209,88); --redText:rgb(255,97,101);
  --glass:rgba(40,40,44,.6); --glassEdge:rgba(255,255,255,.14); --glassShadow:0 10px 36px rgba(0,0,0,.5); --sel:rgba(255,255,255,.1);
  color-scheme:dark;
}}
.dfc *{box-sizing:border-box;}
.dfc button,.dfc input,.dfc select{font-family:inherit;}
.dfc :focus-visible{outline:3px solid color-mix(in srgb,var(--tint) 60%,transparent);outline-offset:2px;border-radius:8px;}
.loading{font-family:-apple-system,system-ui,sans-serif;padding:80px 20px;text-align:center;color:rgba(60,60,67,.6);}

.wrap{max-width:720px;margin:0 auto;padding:4px 16px calc(env(safe-area-inset-bottom,0px) + 48px);}
.head{display:grid;gap:2px;padding:8px 4px 16px;}
.head .footnote{font-size:15px;line-height:20px;}
.largeTitle{font-family:var(--fd);font-size:34px;line-height:41px;font-weight:700;letter-spacing:.01em;margin:0;}
.footnote{font-size:13px;line-height:18px;color:var(--label2);margin:0;}
.save-status.error{color:var(--redText);}

/* Top bar: back on menu pages, ••• for Meals, Past weeks and Tune */
.topbar{position:sticky;top:0;z-index:6;display:flex;justify-content:space-between;align-items:center;max-width:720px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 6px) 10px 6px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);}
.backBtn{display:inline-flex;align-items:center;gap:2px;border:0;background:none;color:var(--tintText);font-size:17px;cursor:pointer;padding:6px 4px;}
.menuWrap{position:relative;}
.menuBtn{width:38px;height:38px;border-radius:999px;border:0;background:var(--fill2);color:var(--tintText);display:grid;place-items:center;cursor:pointer;}
.menuBtn[aria-expanded="true"]{background:color-mix(in srgb,var(--tint) 18%,var(--bg2));}
.menu{position:absolute;right:0;top:46px;min-width:210px;background:var(--bg2);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18),0 0 0 1px var(--sep);padding:6px;display:grid;}
.menu button{border:0;background:none;text-align:left;font-size:17px;color:var(--label);padding:11px 14px;border-radius:9px;cursor:pointer;}
.menu button:hover{background:var(--fill2);}

/* Week header: big title, with the week stepper beside it */
.weekHead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:0 4px 18px;}
.weekTitle{display:grid;gap:2px;min-width:0;}
.weekTitle .footnote{font-size:15px;line-height:20px;}
.weekNav{display:flex;gap:2px;background:var(--fill2);border-radius:999px;padding:3px;flex:none;}
.weekNav button{width:40px;height:36px;border:0;border-radius:999px;background:transparent;color:var(--tintText);display:grid;place-items:center;cursor:pointer;}
.weekNav button:hover:not(:disabled){background:var(--bg2);}
.weekNav button:disabled{color:var(--label3);cursor:default;}
.secTitle{font-family:var(--fd);font-size:22px;line-height:28px;font-weight:700;margin:14px 4px 0;}
.secTitle:first-of-type{margin-top:0;}
.meal.empty{color:var(--label3);}
.inlineLink{border:0;background:none;padding:0;color:var(--tintText);font:inherit;font-weight:600;cursor:pointer;text-decoration:underline;}

.panel{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;}
.gh{font-size:13px;line-height:18px;color:var(--label2);padding:0 20px;margin:0;}
.gf{font-size:13px;line-height:18px;color:var(--label2);padding:0 20px;margin:0;max-width:62ch;}
.banner{background:color-mix(in srgb,var(--tint) 12%,var(--bg2));color:var(--label);border-radius:16px;padding:12px 16px;font-size:15px;line-height:20px;}

/* Inset grouped lists */
.list{list-style:none;margin:0;padding:0;background:var(--bg2);border-radius:26px;overflow:hidden;}
.list.padded{padding:6px 20px 14px;}
.list > li{position:relative;}
.list > li + li::before{content:"";position:absolute;top:0;left:20px;right:0;height:1px;background:var(--sep);z-index:1;}
.li{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:10px 16px 10px 20px;border:0;background:transparent;color:inherit;text-align:left;font:inherit;}
button.li{cursor:pointer;}
button.li:active{background:var(--sel);}
.lab{flex:1;min-width:0;display:grid;gap:1px;color:inherit;text-decoration:none;}
.meal{font-size:17px;line-height:22px;}
.sub{font-size:13px;line-height:18px;color:var(--label2);overflow:hidden;text-overflow:ellipsis;}
.chev{color:var(--label3);flex:none;transition:transform .2s;}

/* This week */
.dayCol{width:38px;flex:none;display:grid;justify-items:center;line-height:1;}
.dayCol b{font-size:12px;font-weight:600;color:var(--tint);text-transform:none;}
.dayCol small{font-family:var(--fr);font-size:22px;line-height:26px;font-weight:600;color:var(--label);}
.days li.open .dayRow .chev{transform:rotate(90deg);}
.lockIc{color:var(--label2);flex:none;}
.dayMore{padding:4px 20px 16px 70px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;}
.moreHead{margin:0;font-size:13px;color:var(--label2);}
.alts{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;}
.alt{display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;border-radius:12px;padding:10px 12px;background:var(--fill2);color:var(--label);font-size:15px;cursor:pointer;text-align:left;}
.alt.on{background:color-mix(in srgb,var(--tint) 16%,var(--bg2));color:var(--tintText);font-weight:600;}
.pct{font-variant-numeric:tabular-nums;color:var(--label2);font-size:13px;}
.alt.on .pct{color:var(--tintText);}
.row2{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:15px;}
.row2 select{min-width:0;max-width:58%;text-overflow:ellipsis;border:0;background:transparent;color:var(--tintText);font-size:15px;text-align:right;cursor:pointer;}
.ingsLine{margin:0;font-size:13px;line-height:18px;color:var(--label2);}
@media (max-width:420px){.dayMore{padding-left:20px;}}

.actions{display:flex;gap:10px;flex-wrap:wrap;padding:4px 0;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:var(--fill2);color:var(--tintText);font-size:15px;line-height:20px;font-weight:600;padding:10px 18px;border-radius:999px;cursor:pointer;}
.btn:active{transform:scale(.97);}
.btn.primary,.btn.cta{background:var(--tint);color:var(--onTint);}
.btn.ghost{background:var(--fill2);color:var(--tintText);}
.btn.small{font-size:13px;padding:6px 12px;}
.btn.wide{width:100%;padding:14px 18px;font-size:17px;}
.btn.danger{color:var(--redText);}
.btn:disabled{opacity:.5;}
.textBtn{border:0;background:none;color:var(--tintText);font-size:15px;font-weight:600;cursor:pointer;padding:6px 0;white-space:nowrap;}

/* Model, in a disclosure */
details.group{display:grid;gap:7px;}
details.group > summary{list-style:none;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 20px;}
details.group > summary::-webkit-details-marker{display:none;}
details.group[open] > summary .chev{transform:rotate(90deg);}
.slider{padding:12px 0;}
.slider + .slider{border-top:1px solid var(--sep);}
.slider-top{display:flex;justify-content:space-between;gap:10px;font-size:15px;}
.slider-val{color:var(--label2);font-variant-numeric:tabular-nums;}
.slider input[type=range]{width:100%;margin:10px 0 4px;accent-color:var(--tint);}
.slider-hint{font-size:13px;line-height:18px;color:var(--label2);}

/* Shop */
.meterRow{display:grid;gap:6px;padding:0 4px;font-size:13px;line-height:18px;color:var(--label2);}
.meter{height:6px;border-radius:999px;background:var(--fill);overflow:hidden;}
.meter i{display:block;height:100%;background:var(--moss);border-radius:999px;transition:width .3s;}
.tick{flex:none;width:26px;height:26px;border-radius:999px;border:2px solid var(--label3);background:transparent;color:transparent;display:grid;place-items:center;cursor:pointer;padding:0;transition:background .18s,border-color .18s;}
.tick[aria-pressed="true"]{background:var(--moss);border-color:var(--moss);color:#fff;}
.basket li.got .meal{color:var(--label2);}
.more{flex:none;width:36px;height:36px;border:0;border-radius:999px;background:transparent;color:var(--label2);display:grid;place-items:center;cursor:pointer;}
.more[aria-expanded="true"]{background:var(--fill2);color:var(--tintText);}
.itemMore{padding:2px 20px 14px 58px;display:grid;gap:8px;}
.linkRow{display:grid;gap:6px;font-size:13px;color:var(--label2);}
.linkField{display:flex;gap:8px;}
.linkField input{flex:1;min-width:0;font-size:15px;padding:9px 12px;border-radius:10px;border:0;background:var(--fill2);color:var(--label);}
.err{font-size:13px;color:var(--redText);}
@media (max-width:420px){.itemMore{padding-left:20px;}}

/* History and Meals */
.sec-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:0 4px;}
.sec-head h2{font-family:var(--fd);font-size:20px;line-height:25px;font-weight:600;margin:0;}
.mt{margin-top:20px;}
.note{font-size:13px;line-height:18px;color:var(--label2);margin:0;padding:0 4px;max-width:62ch;}
.muted{color:var(--label2);font-size:15px;}
.pad{padding:14px 20px;}
.confirmed-note{background:color-mix(in srgb,var(--tint) 12%,var(--bg2));border-radius:16px;padding:12px 16px;font-size:15px;}
.retro-confirm,.planned-week{background:var(--bg2);border-radius:26px;padding:14px 0 6px;}
.retro-range{font-size:13px;color:var(--label2);padding:0 20px 6px;display:block;}
.planned-week-head{display:flex;justify-content:space-between;align-items:center;padding-right:10px;}
.retro-list{list-style:none;margin:0;padding:0;}
.retro-row{display:flex;align-items:center;gap:12px;padding:10px 20px;border-top:1px solid var(--sep);}
.retro-day{width:92px;flex:none;display:grid;}
.retro-day .dow{font-size:15px;}
.retro-day .date{font-size:12px;color:var(--label2);}
.retro-select,.grid select{flex:1;min-width:0;border:0;background:transparent;color:var(--tintText);font-size:15px;cursor:pointer;}
.retro-actions{display:flex;gap:10px;padding:10px 20px 8px;}
.icon-btn{border:0;background:transparent;color:var(--label2);width:34px;height:34px;border-radius:999px;display:grid;place-items:center;cursor:pointer;}
.icon-btn:hover{background:var(--fill2);}
.grid-wrap{background:var(--bg2);border-radius:20px;overflow-x:auto;}
.grid{border-collapse:collapse;width:100%;font-size:13px;}
.grid th{font-weight:600;color:var(--label2);padding:10px 4px;}
.grid td{padding:6px 4px;border-top:1px solid var(--sep);}
.grid select{width:100%;min-width:84px;font-size:13px;}
.wk-label{color:var(--label2);white-space:nowrap;padding-left:14px !important;}
.add-row{display:flex;gap:8px;}
.add-row input{flex:1;min-width:0;font-size:17px;padding:12px 16px;border-radius:14px;border:0;background:var(--bg2);color:var(--label);}
.lib{list-style:none;margin:0;padding:0;background:var(--bg2);border-radius:26px;overflow:hidden;}
.lib-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px 6px 20px;position:relative;}
.lib-row + .lib-row::before{content:"";position:absolute;top:0;left:20px;right:0;height:1px;background:var(--sep);}
.lib-main{flex:1;min-width:0;display:grid;gap:4px;text-align:left;border:0;background:transparent;color:inherit;padding:8px 0;cursor:pointer;}
.lib-name{font-size:17px;}
.chips{display:flex;flex-wrap:wrap;gap:4px;}
.chip{font-size:12px;line-height:16px;padding:2px 8px;border-radius:999px;background:var(--fill2);color:var(--label2);}
.chip.veg{background:color-mix(in srgb,var(--moss) 18%,transparent);color:var(--moss);}
.chip.fish{background:color-mix(in srgb,var(--tint) 16%,transparent);color:var(--tintText);}
.chip.treat{background:color-mix(in srgb,var(--salmon) 22%,transparent);color:var(--salmon);}
.meal-edit{flex-basis:100%;display:grid;gap:10px;padding:4px 10px 14px 0;}
.meal-edit label{display:grid;gap:4px;font-size:13px;color:var(--label2);}
.meal-edit input,.meal-edit select{font-size:15px;padding:9px 12px;border-radius:10px;border:0;background:var(--fill2);color:var(--label);}
.toggles{display:flex;flex-wrap:wrap;gap:6px;}
.toggle{border:0;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;background:var(--fill2);color:var(--label2);cursor:pointer;}
.toggle.on{background:var(--tint);color:var(--onTint);}
.ings-edit-top{display:flex;justify-content:space-between;align-items:center;}
.suggest-btn{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:var(--tintText);font-size:13px;font-weight:600;cursor:pointer;}
.empty{background:var(--bg2);border-radius:26px;padding:28px 20px;display:grid;gap:14px;justify-items:start;}
.empty p{margin:0;color:var(--label2);}

/* Switch, as in iOS */
.switch{position:relative;width:51px;height:31px;flex:none;}
.switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;z-index:1;}
.switch span{position:absolute;inset:0;border-radius:999px;background:var(--fill);transition:background .25s;}
.switch span::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:999px;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.15),0 1px 1px rgba(0,0,0,.16);transition:transform .25s;}
.switch input:checked + span{background:var(--green);}
.switch input:checked + span::after{transform:translateX(20px);}
@media (prefers-reduced-motion:reduce){.dfc *{transition:none !important;}}
`;

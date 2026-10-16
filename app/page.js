"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dices, Plus, Trash2, ChevronLeft, ChevronRight, Check, Sparkles, Lock, ShoppingBasket, MoreHorizontal, X, Timer } from "lucide-react";

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

/* ------------------------------------------------------------------ *
 *  MEAL PREP — one Sunday session for the week's prep-friendly meals.
 *  Each meal carries prepTasks (Claude drafts them, you edit them):
 *    { id, kind: "chop" | "cook", ingredient?, qty?, unit?, cut?, text,
 *      minutes?, handsOff?, equip?: "slow cooker" | "oven" | "hob", stage?: "base" | "finish" }
 *  A meal's prep level picks which of them run on Sunday:
 *    chop = chopping only · part = chopping + the "base" cooking · full = everything.
 * ------------------------------------------------------------------ */
const PREP_LEVELS = [["chop", "Chop"], ["part", "Part"], ["full", "Full"]];
/* Food Standards Agency: eat cooked leftovers within 2 days; freeze anything for later in the week */
const COOKED_FRIDGE_DAYS = 2;
const RAW_VEG_FRIDGE_DAYS = 5;
const EQUIPMENT = { "slow cooker": 1, oven: 1, hob: 4 };
const MEAT = /\b(beef|lamb|pork|chicken|sausage|mince|bacon|chorizo|steak)/;
const NOT_CHOPPED = /\b(tins?|tinned|chopped tomatoes|passata|stock|paste|sauce|rice|pasta|spaghetti|pappardelle|noodles?|couscous|tortillas?|wraps?|bread|buns?|flatbreads?|pastry|sheets|cheese|cheddar|mozzarella|parmesan|feta|cream|crème fraîche|yogh?urt|milk|butter|oil|spices?|seasoning|salt|black pepper|herbs|beans?|chickpeas?|lentils?|coconut milk|peanuts?|apricots?|ras el hanout|gravy|flour|sugar|eggs?|hummus|olives|tzatziki|salsa|soured cream|béchamel|mince|sausages?|paprika|cumin|turmeric|cinnamon|oregano|thyme|bay|garam masala|curry powder)\b/;
const CUTS = [[/onion|shallot|leek/, "diced"], [/pepper|courgette|mushroom|celery/, "sliced"], [/carrot|potato|squash|aubergine|swede|parsnip/, "diced"], [/garlic|ginger|chilli/, "crushed"], [MEAT, "diced"]];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function guessPrep(m) {
  const n = (m.name || "").toLowerCase();
  const has = (...ws) => ws.some((w) => n.includes(w));
  const batch = has("slow cooker", "stew", "casserole", "curry", "massaman", "rendang", "chilli", "bolognese", "ragù", "ragu", "lasagne", "cottage", "shepherd", "pie", "enchilada", "goulash", "tagine", "dal", "dahl", "soup");
  const light = has("traybake", "fajita", "stroganoff", "stir");
  return { friendly: !m.isSkip && !m.isTreat && (batch || light), level: batch ? "full" : "chop" };
}
const prepOf = (m) => {
  const g = guessPrep(m);
  return { friendly: m.prepFriendly ?? g.friendly, level: m.prepLevel || g.level };
};

/* deterministic draft, used when Claude can't be reached */
function draftPrepTasks(m) {
  const n = (m.name || "").toLowerCase();
  const slow = /slow cooker|stew|casserole|massaman|rendang|goulash|tagine/.test(n);
  const assemble = /lasagne|pie|enchilada|bake|cottage|shepherd/.test(n);
  const tasks = [];
  (m.ingredients || []).forEach((ing, i) => {
    const k = ing.trim().toLowerCase();
    if (!k || NOT_CHOPPED.test(k)) return;
    const cut = (CUTS.find(([re]) => re.test(k)) || [null, "chopped"])[1];
    tasks.push({ id: "c" + i, kind: "chop", ingredient: k, cut, text: `${cap(k)}, ${cut}` });
  });
  const meat = (m.ingredients || []).some((x) => MEAT.test(x.toLowerCase()));
  const base = meat ? "Brown the meat and soften the onions" : "Soften the onions and spices";
  tasks.push({ id: "b1", kind: "cook", stage: "base", text: slow ? `${base}, then everything into the slow cooker` : `${base}, then add the sauce`, minutes: 20 });
  tasks.push(slow
    ? { id: "b2", kind: "cook", stage: "base", text: "Slow cook on low", minutes: 360, handsOff: true, equip: "slow cooker" }
    : { id: "b2", kind: "cook", stage: "base", text: "Simmer", minutes: 30, handsOff: true, equip: "hob" });
  if (assemble) tasks.push({ id: "f1", kind: "cook", stage: "finish", text: "Assemble in the dish, ready to bake on the night", minutes: 15 });
  return tasks;
}

/* keep only well-formed tasks (Claude's output, or anything hand-edited) */
function cleanPrepTasks(arr) {
  if (!Array.isArray(arr)) return null;
  const out = arr.slice(0, 24).map((t, i) => {
    const kind = t && t.kind === "cook" ? "cook" : "chop";
    const o = { id: String(t?.id || kind[0] + i), kind, text: String(t?.text || "").slice(0, 140) };
    if (kind === "chop") {
      if (t.ingredient) o.ingredient = String(t.ingredient).toLowerCase().slice(0, 40);
      if (t.cut) o.cut = String(t.cut).toLowerCase().slice(0, 20);
      if (Number(t.qty) > 0) o.qty = Number(t.qty);
      if (t.unit) o.unit = String(t.unit).slice(0, 10);
      if (!o.text) o.text = cap([o.ingredient, o.cut].filter(Boolean).join(", "));
    } else {
      o.minutes = Math.max(1, Math.min(720, Math.round(Number(t.minutes) || 10)));
      if (t.handsOff) o.handsOff = true;
      if (EQUIPMENT[t.equip]) o.equip = t.equip;
      o.stage = t.stage === "finish" ? "finish" : "base";
    }
    return o;
  }).filter((t) => t.text);
  return out.length ? out : null;
}

async function aiPrepTasks(m, level) {
  try {
    const res = await fetch("/api/prep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: m.name, ingredients: m.ingredients || [], level }),
    });
    const data = await res.json();
    return cleanPrepTasks(data.tasks);
  } catch {
    return null;
  }
}

const addDays = (d, n) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((addDays(b, 0) - addDays(a, 0)) / 86400000);

/* the Sunday plan: merged chopping, a running order that starts the longest hands-off
   cooks first on the kitchen's equipment, then a labelled container per meal */
function buildPrepPlan(picks, byId, monday, startMs) {
  const meals = picks
    .map((p) => ({ ...p, meal: byId[p.mealId] }))
    .filter((p) => p.meal && dayDiff(new Date(startMs), addDays(monday, p.night)) >= 0) // nothing to prep for nights already gone
    .map((p) => {
      const all = p.meal.prepTasks?.length ? p.meal.prepTasks : draftPrepTasks(p.meal);
      const tasks = all.filter((t) => t.kind === "chop" || (p.level === "part" && t.stage !== "finish") || p.level === "full");
      return { ...p, tasks, handsOff: tasks.reduce((s, t) => s + (t.handsOff ? t.minutes || 0 : 0), 0) };
    });
  const chopKey = (t) => "c:" + ingKey(t.ingredient || t.text) + "|" + (t.cut || "");

  const chops = new Map();
  meals.forEach((p) => p.tasks.filter((t) => t.kind === "chop").forEach((t) => {
    const key = chopKey(t);
    if (!chops.has(key)) chops.set(key, { key, ingredient: t.ingredient || "", cut: t.cut || "", text: t.text, qty: {}, uses: [] });
    const c = chops.get(key);
    if (t.qty) c.qty[t.unit || ""] = (c.qty[t.unit || ""] || 0) + t.qty;
    if (!c.uses.some((u) => u.night === p.night)) c.uses.push({ name: p.meal.name, night: p.night });
  }));
  chops.forEach((c) => {
    const q = Object.entries(c.qty).map(([u, n]) => `${+n.toFixed(2)}${u ? (u.length > 2 ? " " : "") + u : ""}`).join(" + ");
    c.label = q && c.ingredient ? `${q} ${c.ingredient}${c.cut ? ", " + c.cut : ""}` : c.text;
  });

  const steps = [];
  const packs = [];
  const free = Object.fromEntries(Object.entries(EQUIPMENT).map(([k, n]) => [k, Array(n).fill(0)]));
  const done = new Set();
  let t = 0; // minutes of hands-on work so far
  const sessionDay = new Date(startMs);
  [...meals].sort((a, b) => b.handsOff - a.handsOff || a.night - b.night).forEach((p) => {
    p.tasks.filter((x) => x.kind === "chop").forEach((x) => {
      const key = chopKey(x);
      if (done.has(key)) return;
      done.add(key);
      const c = chops.get(key);
      steps.push({ key, at: t, kind: "chop", text: c.label, uses: c.uses.length > 1 ? c.uses : null, meal: c.uses.length === 1 ? p.meal.name : null });
      t += 2 + c.uses.length;
    });
    let ready = t;
    let cooked = false;
    let bagged = false;
    for (const x of p.tasks.filter((y) => y.kind === "cook")) {
      const key = `s:${p.night}:${p.mealId}:${x.id}`;
      if (x.handsOff) {
        const eq = free[x.equip] ? x.equip : "hob";
        const slots = free[eq];
        const i = slots.indexOf(Math.min(...slots));
        const start = Math.max(ready, slots[i]);
        if (eq !== "hob" && start - ready > 30) { bagged = true; break; } // the slow cooker or oven is taken: cook it on the night
        slots[i] = start + x.minutes;
        steps.push({ key, at: start, kind: "cook", text: x.text, meal: p.meal.name, timer: x.minutes, equip: eq });
        ready = start + x.minutes;
      } else if (ready > t) {
        steps.push({ key, at: ready, kind: "cook", text: x.text, meal: p.meal.name, minutes: x.minutes });
        ready += x.minutes;
      } else {
        steps.push({ key, at: t, kind: "cook", text: x.text, meal: p.meal.name, minutes: x.minutes });
        t += x.minutes;
        ready = t;
      }
      cooked = true;
    }
    const nightDate = addDays(monday, p.night);
    const daysAway = dayDiff(sessionDay, nightDate);
    const hasMeat = p.tasks.some((x) => x.kind === "chop" && MEAT.test(x.ingredient || x.text));
    let store, at;
    if (cooked && !bagged) {
      steps.push({ key: `cool:${p.night}:${p.mealId}`, at: ready, kind: "cook", text: `Cool ${p.meal.name}, lid on within the hour`, meal: p.meal.name, minutes: 30 });
      at = ready + 30;
      store = daysAway <= COOKED_FRIDGE_DAYS
        ? { where: "Fridge", note: `use by ${fmtDM(addDays(sessionDay, COOKED_FRIDGE_DAYS))}` }
        : { where: "Freezer", note: "defrost in the fridge the night before" };
    } else {
      at = t;
      const vegOk = daysAway <= RAW_VEG_FRIDGE_DAYS;
      store = {
        where: vegOk ? "Fridge" : "Freezer",
        note: (vegOk ? `chopped veg, use by ${fmtDM(addDays(sessionDay, RAW_VEG_FRIDGE_DAYS))}` : "chopped veg, straight from frozen")
          + (hasMeat ? ". Raw meat in its own tub, by the pack's use-by date" : "")
          + (bagged ? ". Slow cook it on the night" : ""),
      };
    }
    packs.push({ key: `p:${p.night}:${p.mealId}`, at, name: p.meal.name, night: p.night, date: nightDate, ...store });
  });
  steps.sort((a, b) => a.at - b.at);
  const end = Math.max(t, ...steps.map((s) => s.at + (s.timer || s.minutes || 0)), ...packs.map((p) => p.at + 5));
  return { steps, packs, handsOn: t, end };
}

/* persistence lives in ../lib/store.js (Supabase-backed, single shared row) */

/* =============================== component =============================== */
export default function DinnerForecast({ initialTab = "week" } = {}) {
  const [tab, setTab] = useState(initialTab); // week | prep | library | history | tune
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
  const [prep, setPrep] = useState({}); // week key -> { picks: {night: level}, startedAt, ticked: [keys], timers: {key: endsAt}, done }
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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
        if (st.prep && typeof st.prep === "object") setPrep(st.prep);
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
      const ok = await saveState({ library, weeks, params, plannedWeeks, products, shop, prep, cleared: library.length === 0 });
      setSaveStatus(ok ? "saved" : "error");
    }, 600);
    return () => clearTimeout(t);
  }, [library, weeks, params, plannedWeeks, products, shop, prep, loaded]);

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
    const found = ai || guessIngredients(m.name);
    // add what's missing; never throw away what's already been typed
    const have = new Set((m.ingredients || []).map(ingKey));
    const merged = [...(m.ingredients || [])];
    found.forEach((x) => { const v = x.trim().toLowerCase(); if (v && !have.has(ingKey(v))) { merged.push(v); have.add(ingKey(v)); } });
    updateMeal(m.id, { ingredients: merged });
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

  /* ---- meal prep: one session per week, for the nights ticked ---- */
  const prepSession = prep[sw.key];
  const defaultPicks = useMemo(() => {
    const o = {};
    swMeals.forEach((id, i) => {
      const m = byId[id];
      if (m && !m.isSkip && prepOf(m).friendly && addDays(sw.monday, i) >= addDays(new Date(), 0)) o[i] = prepOf(m).level;
    });
    return o;
  }, [swMeals, byId, sw]);
  const picks = prepSession?.picks || defaultPicks;
  const pickList = useMemo(
    () => Object.entries(picks)
      .map(([n, level]) => ({ night: +n, mealId: swMeals[+n], level }))
      .filter((x) => x.mealId && byId[x.mealId] && addDays(sw.monday, x.night) >= addDays(new Date(), 0)),
    [picks, swMeals, byId, sw]
  );
  const prepStart = prepSession?.startedAt;
  const prepPlan = useMemo(() => buildPrepPlan(pickList, byId, sw.monday, prepStart || Date.now()), [pickList, byId, sw, prepStart]);
  const prepRunning = tab === "prep" && !!prepStart && !prepSession?.done;

  /* /prep is its own address; it opens on the week the coming Sunday preps for */
  const openPrep = useCallback(() => {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7;
    setSel(isoLocal(mondayOfWeek(d, dow >= 4 ? 1 : 0)));
    setTab("prep");
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    if (loaded && initialTab === "prep") openPrep();
  }, [loaded, initialTab, openPrep]);
  useEffect(() => {
    if (!loaded) return;
    const want = tab === "prep" ? "/prep" : "/";
    if (window.location.pathname !== want) window.history.replaceState(null, "", want);
  }, [tab, loaded]);

  /* keep the screen awake while prepping, and tick the timers */
  useEffect(() => {
    if (!prepRunning || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock = null;
    let gone = false;
    const get = async () => { try { lock = await navigator.wakeLock.request("screen"); } catch {} };
    const onVis = () => { if (document.visibilityState === "visible" && !gone) get(); };
    get();
    document.addEventListener("visibilitychange", onVis);
    return () => { gone = true; document.removeEventListener("visibilitychange", onVis); lock?.release?.().catch(() => {}); };
  }, [prepRunning]);
  useEffect(() => {
    if (!prepRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [prepRunning]);
  const buzzed = React.useRef(new Set());
  useEffect(() => {
    Object.entries(prepSession?.timers || {}).forEach(([k, end]) => {
      if (end <= now && now - end < 60000 && !buzzed.current.has(k)) {
        buzzed.current.add(k);
        try { navigator.vibrate?.([300, 150, 300]); } catch {}
      }
    });
  }, [now, prepSession]);

  const setSession = (patch) => setPrep((P) => ({ ...P, [sw.key]: { ...(P[sw.key] || {}), ...patch } }));
  const togglePick = (i, m) => {
    const n = { ...picks };
    if (n[i] !== undefined) delete n[i]; else n[i] = prepOf(m).level;
    setSession({ picks: n });
  };
  const setPickLevel = (i, level) => setSession({ picks: { ...picks, [i]: level } });
  const startPrep = async () => {
    const key = sw.key;
    setStarting(true);
    const need = [...new Map(pickList.map((x) => [x.mealId, byId[x.mealId]])).values()].filter((m) => !m.prepTasks?.length);
    const drafted = Object.fromEntries(await Promise.all(need.map(async (m) => [m.id, (await aiPrepTasks(m)) || draftPrepTasks(m)])));
    if (need.length) setLibrary((L) => L.map((m) => (drafted[m.id] ? { ...m, prepTasks: drafted[m.id] } : m)));
    setPrep((P) => ({ ...P, [key]: { picks, startedAt: Date.now(), ticked: [], timers: {}, done: false } }));
    setNow(Date.now());
    setStarting(false);
    window.scrollTo(0, 0);
  };
  const tickStep = (step) =>
    setPrep((P) => {
      const cur = P[sw.key] || {};
      const t = new Set(cur.ticked || []);
      const timers = { ...(cur.timers || {}) };
      if (t.has(step.key)) { t.delete(step.key); delete timers[step.key]; }
      else { t.add(step.key); if (step.timer) timers[step.key] = Date.now() + step.timer * 60000; }
      return { ...P, [sw.key]: { ...cur, ticked: [...t], timers } };
    });
  const resetPrep = () => setPrep((P) => { const n = { ...P }; delete n[sw.key]; return n; });

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
  const STATUS = { past: "Eaten", planned: "Confirmed", draft: "Forecast" };
  const PAGE = { library: "Meals", history: "Past weeks", tune: "Tune the forecast" };

  return (
    <div className="dfc">
      <style>{CSS}</style>

      <div className="topbar">
        {tab !== "week" && tab !== "prep" ? (
          <button className="backBtn" onClick={() => openPage("week")}>
            <ChevronLeft size={20} /> {weekName(sw.monday, thisMonday)}
          </button>
        ) : (
          <div className="weekBar" role="group" aria-label="Choose week">
            <button className="stepBtn" aria-label="Previous week" disabled={swPos <= 0} onClick={() => go(swPos - 1)}><ChevronLeft size={22} /></button>
            <h1 className="weekTitle">{weekName(sw.monday, thisMonday)}</h1>
            <button className="stepBtn" aria-label="Next week" disabled={swPos >= weekList.length - 1} onClick={() => go(swPos + 1)}><ChevronRight size={22} /></button>
            {saveStatus === "error" ? (
              <span className="status error">Not saved</span>
            ) : tab === "prep" ? (
              <span className="status planned">Prep</span>
            ) : (
              sw.kind !== "past" && <span className={`status ${sw.kind}`}>{STATUS[sw.kind]}</span>
            )}
          </div>
        )}
        <div className="menuWrap">
          <button className="menuBtn" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              {tab === "prep" ? (
                <button role="menuitem" onClick={() => openPage("week")}>Dinners</button>
              ) : (
                <button role="menuitem" onClick={openPrep}>Meal prep</button>
              )}
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
                        {prepSession?.done && prepSession.picks?.[i] !== undefined && <span className="chip prepped">Prepped</span>}
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
              {sw.kind !== "past" && pickList.length > 0 && (
                <button className="btn wide prepLink" onClick={() => { setTab("prep"); window.scrollTo(0, 0); }}>
                  <Timer size={17} /> {prepSession?.done ? "Prep done" : prepStart ? "Carry on prepping" : `Meal prep: ${pickList.length} ${pickList.length === 1 ? "dinner" : "dinners"}`}
                </button>
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

      {tab === "prep" && (
        <PrepView
          {...{ hasData, swMeals, byId, picks, pickList, plan: prepPlan, session: prepSession, now, starting, monday: sw.monday }}
          onPick={togglePick} onLevel={setPickLevel} onStart={startPrep} onTick={tickStep}
          onFinish={() => setSession({ done: true })} onReset={resetPrep} onMeals={() => openPage("library")}
        />
      )}

      {tab !== "week" && tab !== "prep" && (
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

          <datalist id="known-ings">
            {[...new Set(library.flatMap((m) => (m.ingredients || []).map((x) => x.trim().toLowerCase())))].sort().map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>

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
                    <IngredientEditor
                      value={m.ingredients || []}
                      onChange={(ingredients) => updateMeal(m.id, { ingredients })}
                      onSuggest={() => suggestIngredients(m)}
                      suggesting={suggesting === m.id}
                    />
                    <PrepEditor meal={m} onChange={(patch) => updateMeal(m.id, patch)} />
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
  return `w/c ${fmtDM(monday)}`;
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

/* ingredients as chips: type one (several words are fine), Enter or comma adds it,
   Backspace on an empty field removes the last; suggestions come from every meal so names stay consistent */
function IngredientEditor({ value, onChange, onSuggest, suggesting }) {
  const [draft, setDraft] = useState("");
  const add = (raw) => {
    const parts = raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) { setDraft(""); return; }
    const have = new Set(value.map(ingKey));
    const next = [...value];
    parts.forEach((x) => { if (!have.has(ingKey(x))) { next.push(x); have.add(ingKey(x)); } });
    onChange(next);
    setDraft("");
  };
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  return (
    <div className="ingEd">
      <div className="ingEdTop">
        <span>Ingredients</span>
        <button type="button" className="suggest-btn" disabled={suggesting} onClick={onSuggest}>
          <Sparkles size={12} /> {suggesting ? "Suggesting…" : "Suggest"}
        </button>
      </div>
      {value.length > 0 ? (
        <ul className="ingChips">
          {value.map((x, i) => (
            <li key={x + i}>
              <span>{x}</span>
              <button type="button" aria-label={`Remove ${x}`} onClick={() => remove(i)}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ingEmpty">None yet. Add them below, or tap Suggest.</p>
      )}
      <div className="ingAdd">
        <input
          list="known-ings"
          value={draft}
          placeholder="Add an ingredient"
          enterKeyHint="done"
          aria-label="Add an ingredient"
          onChange={(e) => { const v = e.target.value; if (v.includes(",")) add(v); else setDraft(v); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && value.length) remove(value.length - 1);
          }}
        />
        <button type="button" className="btn small" disabled={!draft.trim()} onClick={() => add(draft)}>Add</button>
      </div>
    </div>
  );
}

const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${Math.round(min % 60)} min` : ""}` : `${Math.max(1, Math.round(min))} min`);
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

function Seg({ value, onChange, label }) {
  return (
    <span className="seg" role="radiogroup" aria-label={label}>
      {PREP_LEVELS.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </span>
  );
}

/* the /prep screen: pick the nights, then work through one checklist */
function PrepView({ hasData, monday, swMeals, byId, picks, pickList, plan, session, now, starting, onPick, onLevel, onStart, onTick, onFinish, onReset, onMeals }) {
  if (!hasData) return <p className="gf">Add some dinners under Meals first.</p>;

  if (!session?.startedAt) {
    const today = addDays(new Date(), 0);
    const nights = swMeals.map((id, i) => [i, byId[id]]).filter(([i, m]) => m && !m.isSkip && addDays(monday, i) >= today);
    return (
      <section className="panel">
        <h2 className="secTitle">Meal prep</h2>
        <p className="gf">Tick what to prep in one go. Chop does the knife work, Part also cooks the base, Full cooks it to the end for the fridge or freezer.</p>
        {nights.length === 0 ? (
          <p className="gf">No dinners left to prep this week. Step on to next week with ›.</p>
        ) : (
          <ul className="list">
            {nights.map(([i, m]) => {
              const on = picks[i] !== undefined;
              return (
                <li key={i}>
                  <div className="li prepPick">
                    <button className="tick" aria-pressed={on} aria-label={`Prep ${m.name}`} onClick={() => onPick(i, m)}>
                      <Check size={14} />
                    </button>
                    <span className="lab">
                      <span className="meal">{m.name}</span>
                      <span className="sub">{DAY_FULL[i]}</span>
                    </span>
                    {on && <Seg label={`How far to prep ${m.name}`} value={picks[i]} onChange={(v) => onLevel(i, v)} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pickList.length > 0 && (
          <>
            <p className="gf">
              About {fmtDur(plan.handsOn)} at the board, all packed away in about {fmtDur(plan.end)}.
              {pickList.some((p) => !byId[p.mealId]?.prepTasks?.length) && " Claude drafts the steps for any dinner that hasn't got them yet; edit them any time under Meals."}
            </p>
            <button className="btn primary wide" disabled={starting} onClick={onStart}>
              {starting ? "Drafting the prep steps…" : "Start prep"}
            </button>
          </>
        )}
      </section>
    );
  }

  const ticked = new Set(session.ticked || []);
  const all = [...plan.steps, ...plan.packs];
  const doneCount = all.filter((x) => ticked.has(x.key)).length;
  const current = plan.steps.find((x) => !ticked.has(x.key))?.key;
  const clock = (at) => new Date(session.startedAt + at * 60000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const timers = Object.entries(session.timers || {})
    .map(([key, end]) => ({ key, end, step: plan.steps.find((x) => x.key === key) }))
    .filter((x) => x.step && now - x.end < 15 * 60000)
    .sort((a, b) => a.end - b.end);

  return (
    <section className="panel">
      {timers.length > 0 && (
        <div className="timers" role="status">
          {timers.map((x) => (
            <span key={x.key} className={x.end <= now ? "timerPill done" : "timerPill"}>
              <Timer size={14} /> {x.step.meal || x.step.text} {x.end <= now ? "is done" : fmtLeft(x.end - now)}
            </span>
          ))}
        </div>
      )}
      <div className="meterRow">
        <span>{doneCount} of {all.length} done</span>
        <div className="meter" aria-hidden="true"><i style={{ width: `${(doneCount / Math.max(1, all.length)) * 100}%` }} /></div>
      </div>

      <h2 className="secTitle">Running order</h2>
      <ul className="list prepList">
        {plan.steps.map((st) => {
          const on = ticked.has(st.key);
          return (
            <li key={st.key} className={`${on ? "got" : ""}${st.key === current ? " cur" : ""}`}>
              <button className="li prepStep" aria-pressed={on} onClick={() => onTick(st)}>
                <span className="bigTick" aria-hidden="true"><Check size={18} /></span>
                <span className="lab">
                  <span className="meal">{st.text}</span>
                  <span className="sub">
                    {clock(st.at)}
                    {st.meal ? ` · ${st.meal}` : ""}
                    {st.timer ? ` · ${fmtDur(st.timer)}, tap when it's on to start a timer` : st.minutes ? ` · ${fmtDur(st.minutes)}` : ""}
                  </span>
                  {st.uses && (
                    <span className="chips">
                      {st.uses.map((u) => <span key={u.night} className="chip">{u.name} · {DAY_FULL[u.night].slice(0, 3)}</span>)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="secTitle">Pack and label</h2>
      <ul className="list prepList">
        {plan.packs.map((pk) => {
          const on = ticked.has(pk.key);
          return (
            <li key={pk.key} className={on ? "got" : ""}>
              <button className="li prepStep" aria-pressed={on} onClick={() => onTick(pk)}>
                <span className="bigTick" aria-hidden="true"><Check size={18} /></span>
                <span className="lab">
                  <span className="meal">{pk.name} <span className={pk.where === "Freezer" ? "chip freezer" : "chip"}>{pk.where}</span></span>
                  <span className="sub">For {DAY_FULL[pk.night]} {fmtDM(pk.date)}. {cap(pk.note)}.</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {session.done ? (
        <div className="banner">Prep done. The week&rsquo;s dinners are marked as prepped.</div>
      ) : (
        <button className="btn primary wide" onClick={onFinish}><Check size={17} /> Finish prep</button>
      )}
      <div className="actions">
        <button className="textBtn" onClick={onReset}>Start again</button>
        <button className="textBtn" onClick={onMeals}>Edit prep steps</button>
      </div>
      <p className="gf">Cooked food keeps 2 days in the fridge (Food Standards Agency), so anything for later in the week goes in the freezer.</p>
    </section>
  );
}

/* per-meal prep settings and steps, in Meals */
function PrepEditor({ meal, onChange }) {
  const [busy, setBusy] = useState(false);
  const p = prepOf(meal);
  const tasks = meal.prepTasks || [];
  const setTask = (i, patch) => onChange({ prepTasks: tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const draft = async () => {
    if (tasks.length && !window.confirm("Replace these prep steps with a new draft?")) return;
    setBusy(true);
    const t = (await aiPrepTasks(meal)) || draftPrepTasks(meal);
    onChange({ prepTasks: t });
    setBusy(false);
  };
  return (
    <div className="prepEdit">
      <div className="prepEditHead">
        <Toggle on={p.friendly} onClick={() => onChange({ prepFriendly: !p.friendly })}>batch prep</Toggle>
        {p.friendly && <Seg label="Default prep" value={p.level} onChange={(v) => onChange({ prepLevel: v })} />}
      </div>
      {p.friendly && (
        <>
          {tasks.length > 0 && (
            <ol className="taskList">
              {tasks.map((t, i) => (
                <li key={t.id + i} className="taskRow">
                  <select value={t.kind === "cook" ? (t.stage === "finish" ? "finish" : "cook") : "chop"} aria-label="Step type"
                    onChange={(e) => {
                      const v = e.target.value;
                      setTask(i, v === "chop" ? { kind: "chop" } : { kind: "cook", stage: v === "finish" ? "finish" : "base", minutes: t.minutes || 10 });
                    }}>
                    <option value="chop">Chop</option>
                    <option value="cook">Cook ahead</option>
                    <option value="finish">On the night</option>
                  </select>
                  <input value={t.text} aria-label="Step" onChange={(e) => setTask(i, { text: e.target.value })} />
                  {t.kind === "cook" && (
                    <>
                      <input className="mins" type="number" min="1" value={t.minutes || ""} aria-label="Minutes" onChange={(e) => setTask(i, { minutes: Math.max(1, +e.target.value || 1) })} />
                      <label className="handsOff" title="Unattended: slow cooker, oven or simmering">
                        <input type="checkbox" checked={!!t.handsOff} onChange={(e) => setTask(i, { handsOff: e.target.checked, equip: e.target.checked ? t.equip || "hob" : undefined })} /> timer
                      </label>
                      {t.handsOff && (
                        <select value={t.equip || "hob"} aria-label="Equipment" onChange={(e) => setTask(i, { equip: e.target.value })}>
                          {Object.keys(EQUIPMENT).map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      )}
                    </>
                  )}
                  <button className="icon-btn" aria-label="Remove step" onClick={() => onChange({ prepTasks: tasks.filter((_, j) => j !== i) })}><X size={14} /></button>
                </li>
              ))}
            </ol>
          )}
          <div className="actions">
            <button className="btn small" onClick={draft} disabled={busy}><Sparkles size={14} /> {busy ? "Drafting…" : tasks.length ? "Redraft steps" : "Draft prep steps"}</button>
            <button className="btn small ghost" onClick={() => onChange({ prepTasks: [...tasks, { id: "t" + Date.now(), kind: "cook", stage: "base", text: "", minutes: 10 }] })}><Plus size={14} /> Step</button>
          </div>
        </>
      )}
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
/* Apple HIG, matching the FIRE app. Colours come from the shared Slate & Ochre system
   (app/slate-ochre.css, loaded in layout.js); these are this app's names for them. */
.dfc{
  --bg:var(--ds-bg); --bg2:var(--ds-bg2); --bg3:var(--ds-bg3);
  --label:var(--ds-label); --label2:var(--ds-label2); --label3:var(--ds-label3);
  --sep:var(--ds-sep); --fill:var(--ds-fill); --fill2:var(--ds-fill2);
  --tint:var(--ds-accent); --tintText:var(--ds-accent-text); --onTint:var(--ds-on-accent);
  --salmon:var(--ds-series-2); --sun:var(--ds-highlight); --moss:var(--ds-positive); --green:var(--ds-positive); --redText:var(--ds-negative);
  --glass:var(--ds-glass); --glassEdge:var(--ds-glass-edge); --glassShadow:0 10px 36px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);
  --sel:var(--ds-sel);
  --f:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro",system-ui,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --fd:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro",system-ui,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --fr:ui-rounded,"SF Pro Rounded",-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  background:var(--bg); color:var(--label); font-family:var(--f); font-size:17px; line-height:22px; letter-spacing:-.01em;
  min-height:100vh; -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme: dark){.dfc{--glassShadow:0 10px 36px rgba(0,0,0,.5);color-scheme:dark;}}
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
.topbar{position:sticky;top:0;z-index:6;display:flex;justify-content:space-between;align-items:center;gap:8px;max-width:720px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 8px) 16px 10px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);}
.backBtn{display:inline-flex;align-items:center;gap:2px;border:0;background:none;color:var(--tintText);font-size:17px;cursor:pointer;padding:6px 4px;}
.menuWrap{position:relative;}
.menuBtn{width:38px;height:38px;border-radius:999px;border:0;background:var(--fill2);color:var(--tintText);display:grid;place-items:center;cursor:pointer;}
.menuBtn[aria-expanded="true"]{background:color-mix(in srgb,var(--tint) 18%,var(--bg2));}
.menu{position:absolute;right:0;top:46px;min-width:210px;background:var(--bg2);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18),0 0 0 1px var(--sep);padding:6px;display:grid;}
.menu button{border:0;background:none;text-align:left;font-size:17px;color:var(--label);padding:11px 14px;border-radius:9px;cursor:pointer;}
.menu button:hover{background:var(--fill2);}

/* Week bar: ‹ title › and status, in the sticky top bar */
.weekBar{display:flex;align-items:center;gap:2px;min-width:0;flex:1;margin-left:-6px;}
.weekTitle{font-family:var(--fd);font-size:clamp(22px,6vw,28px);line-height:34px;font-weight:700;letter-spacing:.005em;margin:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.stepBtn{flex:none;width:34px;height:38px;border:0;border-radius:999px;background:none;color:var(--tintText);display:grid;place-items:center;cursor:pointer;}
.stepBtn:hover:not(:disabled){background:var(--fill2);}
.stepBtn:disabled{color:var(--label3);cursor:default;}
.status{flex:none;margin-left:6px;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:13px;font-weight:600;}
.status.draft{background:color-mix(in srgb,var(--ds-highlight) 16%,transparent);color:var(--ds-highlight-text);}
.status.draft::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--ds-highlight);}
.status.planned{background:var(--ds-accent-soft);color:var(--ds-accent-text);}
.status.error{background:color-mix(in srgb,var(--ds-negative) 14%,transparent);color:var(--ds-negative);}
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
.ingEd{display:grid;gap:8px;}
.ingEdTop{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--label2);}
.ingChips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px;}
.ingChips li{display:inline-flex;align-items:center;gap:2px;padding:5px 4px 5px 12px;border-radius:999px;background:var(--fill2);font-size:15px;line-height:20px;}
.ingChips button{border:0;background:transparent;color:var(--label2);width:26px;height:26px;border-radius:999px;display:grid;place-items:center;cursor:pointer;}
.ingChips button:hover{background:var(--fill);color:var(--label);}
.ingEmpty{margin:0;font-size:13px;color:var(--label2);}
.ingAdd{display:flex;gap:8px;}
.ingAdd input::-webkit-calendar-picker-indicator{display:none !important;}
.ingAdd input{flex:1;min-width:0;font-size:16px;padding:9px 12px;border-radius:10px;border:0;background:var(--fill2);color:var(--label);}
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

/* Meal prep */
.prepLink{margin-top:4px;}
.chip.prepped{background:var(--ds-accent-soft);color:var(--ds-accent-text);flex:none;}
.chip.freezer{background:var(--ds-accent-soft);color:var(--ds-accent-text);}
.prepPick{flex-wrap:wrap;}
.seg{flex:none;display:inline-flex;gap:2px;background:var(--fill2);border-radius:999px;padding:2px;}
.seg button{border:0;background:transparent;color:var(--label2);font-size:13px;font-weight:600;padding:5px 10px;border-radius:999px;cursor:pointer;}
.seg button.on{background:var(--bg2);color:var(--label);box-shadow:0 1px 3px rgba(0,0,0,.12);}
.prepList .li{min-height:64px;padding:12px 16px 12px 16px;align-items:flex-start;}
.prepList .meal{font-size:19px;line-height:25px;}
.prepList .sub{white-space:normal;}
.prepList .chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}
.bigTick{flex:none;width:34px;height:34px;margin-top:-2px;border-radius:999px;border:2px solid var(--label3);display:grid;place-items:center;color:transparent;transition:background .18s,border-color .18s;}
.prepStep[aria-pressed="true"] .bigTick{background:var(--moss);border-color:var(--moss);color:#fff;}
.prepList li.got .meal{color:var(--label2);text-decoration:line-through;text-decoration-color:var(--label3);}
.prepList li.cur{background:color-mix(in srgb,var(--ds-highlight) 10%,var(--bg2));}
.prepList li.cur .bigTick{border-color:var(--ds-highlight);}
.timers{position:sticky;top:calc(env(safe-area-inset-top,0px) + 58px);z-index:5;display:flex;flex-wrap:wrap;gap:6px;}
.timerPill{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;background:var(--glass);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:var(--glassShadow);font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--label);}
.timerPill.done{background:var(--ds-highlight);color:#fff;animation:pulse 1s ease-in-out infinite alternate;}
@keyframes pulse{to{opacity:.6;}}
@media (prefers-reduced-motion: reduce){.timerPill.done{animation:none;}}
.prepEdit{grid-column:1/-1;display:grid;gap:10px;border-top:1px solid var(--sep);padding-top:12px;}
.prepEditHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.taskList{list-style:none;margin:0;padding:0;display:grid;gap:6px;}
.taskRow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
.taskRow input:not([type=checkbox]),.taskRow select{font-size:15px;padding:7px 10px;border-radius:10px;border:0;background:var(--fill2);color:var(--label);}
.taskRow input:not([type=checkbox]):not(.mins){flex:1;min-width:160px;}
.taskRow .mins{width:68px;}
.handsOff{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:var(--label2);}
`;

import { supabase } from "./supabase";

// Whole app state (library + weeks + params + cleared flag) in a single jsonb
// row of public.meal_state, keyed by ROW_ID. Tiny, single-family, one row.
const ROW_ID = "default";

export async function loadState() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("meal_state")
      .select("data")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) {
      console.error("loadState:", error.message);
      return null;
    }
    return data ? data.data : null;
  } catch (e) {
    console.error("loadState:", e);
    return null;
  }
}

export async function saveState(state) {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("meal_state")
      .upsert({ id: ROW_ID, data: state, updated_at: new Date().toISOString() });
    if (error) {
      console.error("saveState:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("saveState:", e);
    return false;
  }
}

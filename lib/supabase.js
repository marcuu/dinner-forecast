import { createClient } from "@supabase/supabase-js";

// The Supabase URL and anon key are public by design (shipped to the browser);
// data is protected by row-level security, not by hiding the key. We bake the
// project defaults in so the deployed site connects without extra env config,
// while still allowing an override via environment variables.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mvedaurabbwemlqdzwml.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12ZWRhdXJhYmJ3ZW1scWR6d21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDE2OTMsImV4cCI6MjA5MTUxNzY5M30.cEcFO-tfxdLAcEohat0I9XyUli8_71GdhxAAbiNzRzI";

export const supabase = url && key ? createClient(url, key) : null;

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wleonhczrqupiwxyrdue.supabase.co";
const supabasePublishableKey = "sb_publishable_ZEI0Qe3JqxG_MyeENWpFiQ_m7B2IAHg";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export const adminSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey: "vyro-admin-auth-token",
  },
});

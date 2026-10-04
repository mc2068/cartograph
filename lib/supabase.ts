import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { env } from "./env";

// Server code only. The Clerk session token goes out with every request, which
// is what lets a policy read the organization claim. Passing accessToken also
// switches Supabase's own auth off: sessions belong to Clerk, and nothing here
// reads or writes a cookie.
export function createSupabaseClient() {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { accessToken: async () => (await auth()).getToken() },
  );
}

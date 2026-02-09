import { createClient } from "@supabase/supabase-js";

const url =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof window !== "undefined" && window.SUPABASE_URL) ||
  "";
const key =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof window !== "undefined" && window.SUPABASE_ANON_KEY) ||
  "";

if (!url || !key) {
  console.warn(
    "[supabase] SUPABASE_URL 또는 SUPABASE_ANON_KEY가 없습니다. .env 또는 config.js를 설정하세요."
  );
}

export const supabaseClient =
  url && key ? createClient(url, key) : null;

if (typeof window !== "undefined") {
  window.supabaseClient = supabaseClient;
}

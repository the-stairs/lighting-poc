// CDN UMD (window.supabase) 사용, config.js의 window 변수 사용
(function () {
  const url =
    typeof window.SUPABASE_URL !== "undefined" ? window.SUPABASE_URL : "";
  const key =
    typeof window.SUPABASE_ANON_KEY !== "undefined"
      ? window.SUPABASE_ANON_KEY
      : "";
  if (!url || !key) {
    console.warn(
      "[supabase] SUPABASE_URL 또는 SUPABASE_ANON_KEY가 없습니다. config.js를 설정하세요."
    );
  }
  window.supabaseClient =
    window.supabase && typeof window.supabase.createClient === "function"
      ? window.supabase.createClient(url, key)
      : null;
})();

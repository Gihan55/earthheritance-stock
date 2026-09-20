export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function isLocalPreview() {
  return process.env.NODE_ENV === "development" && !isSupabaseConfigured();
}

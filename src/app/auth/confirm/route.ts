import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (
    isSupabaseConfigured() &&
    token_hash &&
    (type === "invite" || type === "recovery")
  ) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error)
      return NextResponse.redirect(new URL("/account/password", request.url));
  }
  return NextResponse.redirect(
    new URL("/login?reason=invitation", request.url),
  );
}

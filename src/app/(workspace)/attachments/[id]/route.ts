import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDocumentById } from "@/lib/records";

// Row-level security on public.documents already limits the lookup to record
// types the signed-in user may read, so finding the row is the permission
// check. The bucket itself is private; we hand out a 30-second signed URL.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isSupabaseConfigured()) notFound();
  const doc = await getDocumentById(id);
  if (!doc) notFound();
  const { data, error } = await createAdminSupabase()
    .storage.from("attachments")
    .createSignedUrl(doc.file_path, 30, { download: doc.file_name });
  if (error || !data?.signedUrl)
    return NextResponse.json(
      { error: "The file is currently unavailable." },
      { status: 502 },
    );
  return NextResponse.redirect(data.signedUrl);
}

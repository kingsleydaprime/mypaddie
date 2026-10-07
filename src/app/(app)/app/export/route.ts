import { NextResponse } from "next/server";
import { serverClient } from "@/shared/supabase/server";

/** Everything of yours, as one JSON file (public.export_all walks every table, as you, under RLS). */
export async function GET(request: Request) {
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return NextResponse.redirect(new URL("/login?next=/app/settings", request.url));
  const { data, error } = await supabase.rpc("export_all");
  if (error) return new Response("Export failed. Try again.", { status: 500 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mypaddie-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

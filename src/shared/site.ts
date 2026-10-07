import { headers } from "next/headers";

/**
 * This site's origin as the browser sees it ("https://mypaddie.spectroniqlimited.com",
 * "http://localhost:3000"), for links Supabase sends people back to. Supabase
 * only follows redirects on its allow-list (Authentication → URL Configuration),
 * so a spoofed Host header can't send anyone elsewhere.
 */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

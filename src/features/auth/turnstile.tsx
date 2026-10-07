"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

type TurnstileApi = { render: (el: HTMLElement, opts: { sitekey: string; theme?: string }) => string; remove: (id: string) => void };
declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __turnstileReady?: (() => void)[];
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile inside a form: adds a hidden `cf-turnstile-response`
 * field that Supabase Auth checks (Authentication → Attack Protection →
 * CAPTCHA). Off until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Tokens are
 * single-use, so give it a new `key` after a failed submit to get a fresh one.
 */
export function Turnstile() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let id: string | null = null;
    const el = ref.current;
    const mount = () => {
      if (window.turnstile && el.isConnected && id === null) id = window.turnstile.render(el, { sitekey: SITE_KEY, theme: "auto" });
    };
    if (window.turnstile) mount();
    else (window.__turnstileReady ??= []).push(mount);
    return () => {
      if (id !== null) window.turnstile?.remove(id);
    };
  }, []);
  if (!SITE_KEY) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => {
          for (const f of window.__turnstileReady ?? []) f();
          window.__turnstileReady = [];
        }}
      />
      <div ref={ref} className="min-h-[65px]" />
    </>
  );
}

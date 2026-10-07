/** The Turnstile token from a submitted form, for Supabase Auth's `captchaToken` (undefined when CAPTCHA is off). */
export function captchaToken(form: FormData): string | undefined {
  const t = form.get("cf-turnstile-response");
  return typeof t === "string" && t ? t : undefined;
}

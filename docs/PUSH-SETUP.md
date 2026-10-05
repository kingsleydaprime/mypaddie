# Push notifications: one-time setup

The database decides who to nudge (`private.collect_nudges`, every 10 minutes
via `pg_cron`) and POSTs the nudges to `/api/push`, which words and sends them.
Two secrets connect them. Neither ever goes in this repo.

## 1. Generate keys (local terminal)

```bash
bunx web-push generate-vapid-keys      # → Public Key, Private Key
openssl rand -hex 32                   # → the shared push secret
```

**VAPID keys** identify your app to the browser push services (Google's, for
Chrome on Android). The public half goes to the browser when you subscribe;
the private half signs every notification.

## 2. Vercel → Project → Settings → Environment Variables

| Name | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the VAPID public key |
| `VAPID_PRIVATE_KEY` | the VAPID private key |
| `VAPID_SUBJECT` | `mailto:` + your email (push services contact this if something misbehaves) |
| `PUSH_CRON_SECRET` | the `openssl` value |

Redeploy so they take effect.

## 3. Supabase → SQL Editor (stores the secrets encrypted in Vault)

```sql
select vault.create_secret('https://<your-app>.vercel.app/api/push', 'mypaddie_push_url');
select vault.create_secret('<the openssl value>', 'mypaddie_push_secret');
```

Until both exist, the job still runs every 10 minutes (creating today's habit
rows) but records and sends no nudges.

To change one later: `select vault.update_secret(id, '<new value>') from vault.secrets where name = '<name>';`

## 4. On your phone

Open the installed app → **Paddie** tab → **Turn on nudges** → Allow.

## Checking it works

```sql
-- Did the job run, and how did it go?
select status, return_message, start_time from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'mypaddie-nudges')
  order by start_time desc limit 5;

-- What did /api/push answer? (sent / failed / gone)
select status_code, content, created from net._http_response order by created desc limit 5;
```

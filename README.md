# DesignHub — Supabase Ready

A plain HTML + Tailwind CDN + Vanilla JS design asset manager connected to Supabase. No Vite, Next.js, npm, or bundler required.

## Stack
- HTML
- Tailwind CSS CDN
- Vanilla JavaScript
- Font Awesome
- Supabase JS v2 CDN
- Supabase Auth
- Supabase Postgres
- Supabase Storage

## 1. Configure Supabase
1. Run `supabase/schema.sql` in Supabase SQL Editor.
2. Create your single internal admin in Authentication > Users and enable Auto Confirm User.
3. Copy your Project URL and Publishable Key from Project Settings > API Keys.
4. Open `config.js` and replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE`.

The publishable key is intended for browser/client-side applications. Never put a `sb_secret_*` or legacy `service_role` key in this project. RLS is the security boundary.

## 2. Run locally
Because the app uses browser APIs and share URLs, use a local HTTP server instead of double-clicking `index.html`.

If Python is available:
```bash
python -m http.server 5500
```
Then open `http://localhost:5500`.

VS Code Live Server also works. No npm installation is needed.

## 3. Core flow
Admin login → Dashboard → Add Design → upload to Storage → metadata in Postgres → Share → public preview → reviewer feedback → notification/status update.

Public reviewers do not need an account.

## 4. GitHub
`config.js` may be committed because it contains only the Supabase Project URL and a publishable client key. The publishable key is not a secret. Do NOT commit secret/service-role keys.

For GitHub Pages, make sure the repository contains `index.html` at the published root.

## 5. Storage limits
The SQL schema creates the `design-assets` bucket with a 20 MB per-file limit and image MIME types: PNG, JPEG, WEBP, SVG. Adjust the limit only if your Supabase plan and use case support it.


### Add Design debugging
The New Design form has explicit submit handling, loading states, and an inline error area. If Supabase Storage or the database rejects the request, the exact error is shown in the form and console.

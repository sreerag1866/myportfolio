# MetaAiArt — Anime Proxy: Deployment Guide

This Cloudflare Worker sits between your website and the Anthropic API.
Your API key stays secret on the server — visitors never see it.

---

## What's in this folder

| File | Purpose |
|---|---|
| `worker.js` | The Cloudflare Worker (the proxy) |
| `wrangler.toml` | Cloudflare deployment config |
| `package.json` | npm scripts for deploying |
| `tshirt.html` | Updated T-shirt page — drop this into your site |

---

## Step 1 — Create a free Cloudflare account

Go to **https://cloudflare.com** and sign up (free tier is enough).

---

## Step 2 — Install Wrangler (Cloudflare's CLI)

Open Terminal (Mac/Linux) or Command Prompt (Windows):

```bash
npm install -g wrangler
```

Then log in:

```bash
wrangler login
```

A browser window opens — click Allow.

---

## Step 3 — Deploy the Worker

In this folder, run:

```bash
npm install
npm run deploy
```

You'll see output like:

```
✅ Deployed to: https://metaaiart-anime-proxy.YOUR-NAME.workers.dev
```

**Copy that URL** — you'll need it in Step 5.

---

## Step 4 — Add your Anthropic API key as a secret

```bash
npm run secret
```

It prompts: `Enter a secret value:` — paste your Anthropic API key
(get one at https://console.anthropic.com → API Keys).

The key is encrypted and stored by Cloudflare. It never appears in your code.

---

## Step 5 — Update tshirt.html with your Worker URL

Open `tshirt.html` and find this line near the top of the `<script>`:

```javascript
var WORKER_URL = "https://metaaiart-anime-proxy.YOUR-CF-SUBDOMAIN.workers.dev";
```

Replace it with your actual Worker URL from Step 3:

```javascript
var WORKER_URL = "https://metaaiart-anime-proxy.sreerag.workers.dev";
```

---

## Step 6 — Update the allowed origin in worker.js

Open `worker.js` and find:

```javascript
const ALLOWED_ORIGIN = "https://metaaiart.com";
```

If your site is at a different URL during testing, add it to the `allowed` array
inside the `corsHeaders` function. The list already includes `http://localhost:3000`
and `http://127.0.0.1:5500` for local development.

After changing `worker.js`, redeploy:

```bash
npm run deploy
```

---

## Step 7 — Upload files to metaaiart.com

Upload these files to your hosting (cPanel File Manager, FTP, etc.):

- `index.html` (new MetaAiArt home — from previous delivery)
- `portfolio.html` (your portfolio — from previous delivery)
- `tshirt.html` (this updated version from this folder)

---

## Testing locally

You can test the worker locally before deploying:

```bash
npm run dev
```

This runs the worker at `http://localhost:8787`. Change `WORKER_URL` in
`tshirt.html` to `http://localhost:8787` for local testing, then change
it back to your live Worker URL before uploading.

---

## Optional: Custom domain (api.metaaiart.com)

If you want `api.metaaiart.com/api/anime` instead of the workers.dev URL:

1. Add `metaaiart.com` to your Cloudflare account (update nameservers at your registrar)
2. In `wrangler.toml`, uncomment the `[[routes]]` section and fill in your zone
3. Redeploy: `npm run deploy`
4. Update `WORKER_URL` in `tshirt.html` to `https://api.metaaiart.com`

---

## Cloudflare Free Tier limits

| Resource | Free limit | Your usage |
|---|---|---|
| Worker requests | 100,000/day | Each photo upload = 1 request |
| CPU time | 10ms/request | Well within — Claude API handles the work |
| Memory | 128 MB | Fine |

For a T-shirt site, you won't come close to these limits.

---

## Troubleshooting

**"Failed to fetch" error on the page**
→ Check that `WORKER_URL` in `tshirt.html` matches your deployed Worker URL exactly.

**"Server configuration error"**
→ The `ANTHROPIC_API_KEY` secret wasn't set. Run `npm run secret` again.

**"Anthropic API error: 401"**
→ Your API key is invalid or expired. Generate a new one at console.anthropic.com.

**CORS error in browser console**
→ Your site's origin isn't in the `allowed` array in `worker.js`. Add it and redeploy.

**Worker not updating after changes**
→ Run `npm run deploy` again. Changes take 30–60 seconds to propagate globally.

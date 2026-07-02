# 4leaf

4leaf is a private, installable 4chan reader designed for iPhone, iPad, and the web. It uses 4chan's read-only JSON API and stores favorites, saved threads, content consent, and appearance preferences in the browser.

## Current features

- Installable PWA with iOS Home Screen metadata and offline app shell
- Board directory, favorites, catalog search, and responsive thread reader
- Full-size image viewer and native inline WebM playback
- Thread gallery with image/WebM thumbnails and fullscreen navigation
- Per-thread quick-reply drafts, post quoting, and secure official-domain handoff
- Saved threads stored locally on the device
- Light and dark themes
- Links into official 4chan pages for posting and Pass authorization
- Same-origin, allowlisted API proxy for Cloudflare Pages

## Run locally

```bash
npm install
npm run dev
```

Use `npm run build` to type-check and create the production PWA in `dist/`.

## Install on iOS

The deployed site must use HTTPS. Open it in Safari, tap **Share**, choose **Add to Home Screen**, then confirm. WebM media uses Safari's native video element with inline playback enabled.

## 4chan Pass and posting

4chan's JSON API is read-only. Browser security also prevents a PWA on another origin from setting or reading 4chan's secure authentication cookies or CAPTCHA response. For that reason, 4leaf never asks for or stores a Pass token or PIN. Quick Reply keeps the draft locally, supports `>>post` quoting, copies the finished comment, and opens the official thread for attachment, CAPTCHA/Pass handling, and final submission.

A future native wrapper or a separately hosted server could support posting, but that would add credential, CAPTCHA, abuse-prevention, and privacy responsibilities that the static PWA deliberately avoids.

## Deployment

4chan restricts browser access to its JSON API with CORS, so 4leaf needs the small read-only proxy in `functions/api/4chan/`. Cloudflare Pages runs this function on the same origin as the app and caches upstream responses. It only permits the board list, catalog, and thread JSON paths; it cannot proxy arbitrary URLs.

### Vercel

Vercel uses the equivalent function in `api/4chan/[...path].js`. Import the repository into Vercel and leave the detected Vite settings in place; `vercel.json` fixes the build command and output directory. Every push to the connected production branch triggers a new deployment.

After deployment, verify that `https://YOUR-DOMAIN/api/4chan/boards.json` returns JSON before opening the app. If it returns HTML or a 404, confirm that the Vercel project root is the repository root and redeploy without the build cache.

### Cloudflare Pages

To deploy with Cloudflare Pages:

1. Import this GitHub repository as a Pages project.
2. Set the build command to `npm run build`.
3. Set the output directory to `dist`.
4. Deploy. Cloudflare detects the `functions/` directory automatically.

The local Vite server proxies `/api/4chan` during development, so `npm run dev` needs no additional setup. A different hosting provider will need an equivalent same-origin read-only proxy; static-only GitHub Pages is not sufficient.

4leaf is an independent project and is not affiliated with 4chan Community Support LLC.

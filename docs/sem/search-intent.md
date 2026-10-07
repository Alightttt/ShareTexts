# Search-Intent & SEM Readiness — ShareTexts

*F21 planning artifact. No ads have been launched; this document exists so that
when paid search starts, the landing surfaces, conversion events, and honest
claims are already in place. Everything here must stay consistent with the
product truth enforced by `scripts/verify-seo.mjs` and the in-app copy.*

---

## 1. Positioning (one sentence, used everywhere)

**ShareTexts moves text, links, photos, videos, and files between any two
devices directly in the browser — no app, no account, nothing kept.**

Ad copy may not claim anything this sentence does not support. No "instant,"
no "fastest," no numbers we have not measured.

## 2. Intent clusters → landing surfaces

| # | Intent cluster | Example queries | Landing surface | Why this surface |
|---|----------------|-----------------|-----------------|------------------|
| 1 | Cross-platform transfer | airdrop for windows, transfer files iphone to pc, send files android to mac | `/guides/compare-airdrop.html`, `/guides/how-to-transfer-files-between-devices.html` | Comparison + how-to already answer these verbatim. |
| 2 | No-app transfer | transfer photos without app, send files without installing | `/guides/transfer-photos-without-an-app.html` | Exact-match guide. |
| 3 | Text/clipboard sync | send text to another device, copy paste between phone and pc | `/guides/send-text-between-devices.html`, `/guides/share-clipboard-between-phone-and-pc.html` | Exact-match guides. |
| 4 | Product alternatives | localsend alternative, pairdrop alternative, sharetext alternatives | `/guides/compare-localsend.html`, `/guides/compare-pairdrop.html`, `/guides/compare-cloud.html`, `/guides/compare-whatsapp.html` | Honest comparison guides. |
| 5 | Group / collect over time (NEW) | share files with group without app, collect photos from event, shared folder for a week | `/guides/temporary-spaces.html` | F21 feature guide, answer-first, FAQ JSON-LD. |
| 6 | Trust / safety pre-click | is X safe, how does X work | `/guides/security.html`, `/guides/how-it-works.html` | Technical honesty pages. |

Rule: **every ad lands on a page that would survive organic scrutiny.** If a
query has no honest landing surface, build the guide first (F22 candidate:
"send long video without compression", "wifi direct file transfer").

## 3. Conversion events already instrumented

Telemetry whitelist (`src/lib/telemetry.ts` + `server.ts` + worker
`CLIENT_EVENTS` — three places, must stay in sync):

- `product.page_view` → arrival
- `product.first_interaction` → engagement
- `product.activation` → first completed transfer (once per install) — **the
  SEM primary conversion**
- `product.transfer_completed` → volume signal
- `product.space_created` / `product.space_joined` / `product.space_item_uploaded`
  → Temporary Space funnel (F21). Secondary conversion for cluster 5:
  `space_created` on the create surface, `space_item_uploaded` as depth.
- `product.method_nearby|code|qr|link` → which connect path people choose
  (creative feedback: if `method_qr` spikes under a QR-themed ad, the creative
  matched reality).

Missing before launch: a paid-vs-organic join key. The beacon sends no
campaign params by design (privacy); when SEM starts, append a short-lived
`?utm_…` → sessionStorage flag that only marks the *session*, never the
device, and is excluded from the no-oracle paths. Do not add persistent
identifiers.

## 4. Brand & entity hygiene

- Name is always **ShareTexts** (one word, capital S, capital T) in ads,
  landing pages, JSON-LD, llms.txt. Verified by `verify-seo.mjs`.
- `sameAs` is exactly `https://x.com/0xalyt` + `https://github.com/Alightttt/ShareTexts`.
  If new profiles are created for SEM (e.g., a LinkedIn page), add them to the
  Organization `sameAs` in the same change, or don't create them.
- No AggregateRating / ContactPoint / fake review stars — search ad
  extensions that need ratings are OFF until real ratings exist.

## 5. Budget & guardrails (when it starts)

- Start with clusters 1–3 (highest intent, existing surfaces), exact/phrase
  match only.
- Negative keywords from day one: "airdrop android" (Airdrop is Apple-only —
  the comparison guide covers it, but the ad would overpromise), "torrent",
  "piracy", "crack".
- Landing pages must keep Core Web Vitals green — the guides are static HTML
  with one CSS file and no JS framework; keep it that way.
- Pause rule: any query where landing-page bounce > organic baseline +20%
  signals a claim mismatch — fix the page or the copy, not the targeting.

## 6. Pre-launch checklist

- [x] Honest landing surface for every cluster (guides above)
- [x] Conversion events whitelisted and firing (incl. Space funnel)
- [x] FAQ/answer pages with matching visible text + JSON-LD (AEO)
- [x] llms.txt describes the product truthfully for AI surfaces (GEO)
- [x] Sitemap + robots correct; session routes (/space/, /s/, /room/) excluded
- [ ] Campaign UTM session marker (design note in §3)
- [ ] Search Console + Bing Webmaster verified (external — needs credentials)

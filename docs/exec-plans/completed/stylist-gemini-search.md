# Style Edit local evaluation

This branch evaluates whether a signed-in user can get an owned outfit or see
how one potential addition works in two distinct looks. Retailer matching is a
flagged local experiment. The MVP release remains gated on category-level gap
recommendation and user validation.

## Run locally

Add to the project's local environment file alongside the existing Supabase
configuration, then restart the app. Keep all keys server-side.

```dotenv
ENABLE_STYLIST=true
GEMINI_STYLIST_API_KEY=<Gemini Developer API key>
GEMINI_STYLIST_MODEL=gemini-3.1-flash-lite
```

Open `/search` signed in. The key is optional for the offline rules fallback.
The frontend submits a question or a Daily Finds request to `POST /api/stylist`.
The server sends the question to Gemini for optional intent classification.
Wardrobe data stays in the application. The response source is `gemini` when
classification succeeds and `rules` when the provider is skipped or falls back.
It loads confirmed, active wardrobe items with the signed-in Supabase client and
uses the existing style vector and quiz signals to rank outfits.

## Approved retailer index

Populate the server-only `STYLIST_CATALOG_JSON` variable with a JSON array of
manually reviewed product records. Example contract (illustrative; replace URL,
price and verification time after checking a real product):

```json
[
  {
    "id": "merchant-product-and-color-id",
    "title": "Beige straight-leg chinos",
    "url": "https://www.lcwaikiki.eg/en/example-product",
    "priceEgp": 899,
    "currency": "EGP",
    "stock": "in_stock",
    "checkedAt": "<ISO timestamp from review>",
    "collection": "masculine",
    "role": "bottom",
    "occasions": ["work", "everyday"],
    "styleTags": {"classic": 0.9}
  }
]
```

Supported hosts: `www.lcwaikiki.eg`, `www.defacto.com.eg`, `concrete.store`.
Only available EGP offers reviewed within the last 48 hours qualify.
The offer must respect a user-supplied budget; model-generated prices, URLs and
budgets are never used. Exact size/fit, shipping and live stock are not guaranteed.
No catalog entries are bundled. This is structured search over a reviewed index,
not live web search. Daily Finds is evaluated on demand using the same engine
without a Gemini call. There is no scheduler or retailer-feed automation yet.

## Rollback

Leave `ENABLE_STYLIST` off to keep the original Search placeholder and return
404 from the stylist endpoint. This branch has no database migration.

## Local evaluation

Run `npx vitest run src/lib/stylist/stylist.test.ts src/app/api/stylist/route.test.ts`.
The fixtures cover Arabic and English intent, numeric budgets, two grounded outfit
examples, no buying on restyle requests, stale inventory, collection boundaries,
empty and sparse wardrobes, and malformed/failed provider responses.
The committed feature tests mock Gemini and authentication. Local integration
also exercises signed-in Supabase accounts with complete, sparse, and empty
wardrobes. Use fresh synthetic offers with a visible fixture label to test the
budget, retailer host, two-look requirement, and inventory rejection when a
reviewed retailer index is unavailable. Keep credentials and screenshots local.

## Verification on 19 November 2026

- Local Supabase and labeled offer fixtures passed the owned-only, budget,
  no-match, sparse-wardrobe, and empty-wardrobe checks. The 899 EGP fixture
  appeared in two different outfits. Expired and unavailable offers were
  excluded. Live retailer availability remains unverified.
- Playwright checked Chromium at 360, 390, and 1280 px. It verified inline RTL,
  keyboard focus, visible loading and retry, and access to the last action
  above the mobile navigation after scrolling.
- Live Gemini returned valid classifications. Ask Stylist also returned
  correct results when it fell back to rules. Daily Finds did not call Gemini.

For the next gate, collect 20 real Arabic/English prompts from test users and
evaluate the live provider using an approved key and fresh catalog. Check valid
JSON rate, intent/category agreement, zero price/budget conflicts, two useful
looks for accepted offers, and median/tail latency. Add shared rate limiting and
cost monitoring before enabling the feature for a public audience. Add retailer
feeds and scheduling only after validating the manual index.

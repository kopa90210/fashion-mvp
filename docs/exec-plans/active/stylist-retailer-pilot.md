# StyleGraph retailer pilot

Prove that a real, affordable product adds useful looks to clothes someone
already owns. Buying is optional; the retailer handles checkout, fulfillment,
and returns. The pilot changes neither Today nor wardrobe ownership.

| Role | Decision for this pilot | Evidence required |
| --- | --- | --- |
| Product | One useful suggestion with two distinct outfits | Three real wardrobes; note which outfits people would wear and why. |
| Data and commerce | Start with six manually reviewed offers; retailer owns price, stock, and URL | Open each page and verify Egyptian market, price in EGP, at least one orderable size, and review time. |
| Backend | Use the existing signed-in wardrobe read and deterministic matcher | Over-budget, stale, ambiguous, unavailable and wrong-collection offers never appear as purchase results. |
| AI | Gemini classifies requests; rules remain available | Compare Arabic and English intent with and without the provider. Gemini never supplies product facts. |
| Design | Owned looks come first; one purchase and two examples when warranted | Check 360 px and 390 px, Arabic RTL, keyboard focus, retry and no-match. |
| Security | Limit builds and API access to named pilot accounts; send only the question to the provider | Test an allowed account and a separate signed-in non-member. Never put credentials, raw questions, or wardrobes in logs. |
| QA and operations | Use synthetic data for regressions and real products for the pilot | Record automated results, authenticated browser results, product-page evidence, fallback ratio and latency separately. |

## Local and preview setup

1. Run the [reviewed CSV workflow](../../stylist-retailer-catalog.md) against local
   Supabase. The JSON is generated locally and can be replaced without a database
   change. The fixtures in tests are synthetic; do not publish them as offers.
2. Run `npm test -- src/lib/stylist/stylist.test.ts src/app/api/stylist/route.test.ts`,
   `python -m unittest discover -s tests -p test_build_stylist_catalog.py`, and
   `npx tsc --noEmit`.
3. For a protected Preview, use a test Supabase environment, and configure
   `ENABLE_STYLIST=true`, `STYLIST_PILOT_USER_IDS` (comma-separated Supabase Auth
   user IDs), and `STYLIST_CATALOG_JSON` there. Run without a Gemini key first.
   Set `STYLIST_PILOT_METRICS=true` to log only view, outcome, elapsed time,
   catalog state, and intent source. Protect the deployment itself separately
   if available. Keep the feature off in Production.
4. To pause, set `ENABLE_STYLIST=false` and restart or redeploy the environment
   using its existing configuration. To pause shopping only, remove the
   catalog value; owned styling stays available.

## Browser checks before inviting testers

| Case | Pass condition |
| --- | --- |
| Arabic explicit purchase within budget | Exactly one verified offer, two distinct complete looks, each using wardrobe pieces and that offer |
| Lower the budget below the item's price | Offer disappears |
| Ask to style owned clothes | No buy card |
| Choose opposite collection, or test a stale/unknown-stock fixture | Offer stays hidden |
| Sparse or empty wardrobe | No invented pieces or purchase recommendation |
| Daily Finds without budget | Owned look if possible; no purchase card or Gemini call |
| Retailer click | Opens the correct Egyptian product page; check price and at least one selectable size |
| User outside the cohort | No Stylist UI or personalized API response |

Do not call the pilot validated until all of these pass with actual signed-in
browser sessions and the six offers have been verified. For each shopping
session, write down the test case, elapsed time, success/fallback, and whether
the tester would wear at least one look. Treat three wardrobes as exploratory
feedback, not a conversion estimate. A wrongful buy link, over-budget price,
or access by a non-member blocks expansion. Shared rate limits and provider
cost limits are required before expanding beyond the pilot.

## Long-term design

1. **Source → review → publish.** Start with CSV. If offers become hard to refresh,
   ingest official merchant feeds or partner APIs as background jobs. Keep raw
   merchant facts separate from style tags and carry source, retailer product
   and variant IDs, fetch time, validation state, and review time. Publish
   validated batches atomically and retain the last good batch. Freshness still
   applies to a retained batch.
2. **Match → explain.** Filter for availability, market, collection, role and
   budget before ranking. Measure whether the two looks are useful in real
   wardrobes before tuning ranking. If more inventory exposes ranking gaps,
   measure candidate recall before introducing another search service.
3. **Scale after evidence.** Move the reviewed index into Supabase when the
   snapshot no longer fits or change frequency justifies it. Publish catalog
   versions independently of code and cache the shared data per version. Keep
   matching personalized on the server and out of shared caches. Separate feed
   outages from request latency by refreshing outside the user request path.

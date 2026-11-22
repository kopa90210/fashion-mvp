# Retailer search release gate

The Browse products view searches the reviewed catalog. Ask Stylist and
Daily Finds continue to use that same catalog for outfit recommendations.
Browsing is account-gated in Preview, performs no Gemini call, and returns
only the display fields of fresh, verified offers. The first release can use
a small reviewed catalog; the current environment snapshot caps it at 250.

## Lowqta workbook intake

The supplied snapshot contains 802 unique SKUs: 549 tops and 253 bottoms.
Outerwear appears among the tops. It has no footwear or one-piece garments.
800 entries have numeric prices; all 802 specify EGP. All listing URLs point
to Lowqta. 664 rows contain retailer-domain links; another 41 entries in the
retailer URL column point back to Lowqta; 97 are blank. There is no verified-at
timestamp or stock field. The sizes in the sheet do not establish live stock.
No rows from the workbook were published.

Review the five DeFacto retailer URL candidates first, since the runtime
already supports that host. Confirm the exact Egyptian product page, EGP price,
current availability, collection and occasion; use the actual review time.
Source separately reviewed footwear so the gap-to-offer path can be tested.
Do not reuse the workbook's price or images as live catalog records by default.
For recurring ingestion, agree on which feed data and images are reusable
with the source/retailer and normalize stable offer and variant IDs.

Before broad rollout: use a server-managed catalog that supports refresh and
withdrawals without redeploying, monitor freshness and dead links, run signed-in
browser tests with real products, and check relevance, mobile accessibility,
latency and Gemini request limits. Keep the Preview allowlist until these
checks pass.

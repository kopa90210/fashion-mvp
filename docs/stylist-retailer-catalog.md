# Build the Stylist catalog from reviewed retailer offers

Copy [the CSV header](./examples/stylist-retailer-review.csv) into the ignored
`.tmp/` directory. Enter one row per canonical product URL; use a stable
retailer-prefixed offer ID. Treat search results or merchant-feed exports as
discovery leads. Before marking a row `approved`, open the Egyptian retailer's
product page and confirm the price in EGP and that at least one size can be
ordered. Record when you checked, including the time zone. Use `pending` or
`stock=unknown` if you cannot verify either detail. Do not refresh timestamps
without checking the source again.

Use `collection` values `masculine`, `feminine`, or `shared`; `one_piece`
offers require `feminine`. Valid roles are `base_layer`, `bottom`, `one_piece`,
`footwear`, and `outerwear`. Separate occasions with a pipe (for example,
`work|everyday`) and leave `style_tags` blank or provide a JSON object of
style weights between 0 and 1. Reviews expire after 48 hours.

From the repository root in PowerShell:

```powershell
New-Item -ItemType Directory -Force .tmp | Out-Null
Copy-Item docs/examples/stylist-retailer-review.csv .tmp/retailer-review.csv
# Fill .tmp/retailer-review.csv before running the next command.
python scripts/build_stylist_catalog.py .tmp/retailer-review.csv --output .tmp/stylist-catalog.json
if ($LASTEXITCODE -ne 0) { throw "Catalog build failed" }
$env:STYLIST_CATALOG_JSON = Get-Content -Raw .tmp/stylist-catalog.json
$env:ENABLE_STYLIST = "true"
npm run dev
```

For a local browser run, point the app to a **local** Supabase, sign in with a
test account, and open `/search`. No Gemini key is needed for the rules baseline.
For the complete-wardrobe case, prepare at least two compatible tops, one pair
of shoes, and an owned bottom. Use an eligible, differently named bottom offer
tagged `work` in that account's shopping collection.

Pass several CSV paths before `--output` to combine retailers in one catalog.
The command reports excluded counts, rejects conflicting rows, and leaves any
previous output intact on failure. No Supabase writes are required. Use a local
test wardrobe to confirm an eligible product reveals two distinct outfits.
Then set the budget below the listed price and confirm the offer disappears.
Also check that unverified offers and offers in the wrong collection stay hidden.

See [the pilot plan](./exec-plans/active/stylist-retailer-pilot.md) for Preview
configuration, acceptance checks, and rollout gates.

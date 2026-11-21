# Daily Finds: wardrobe needs before retailer results

Use the two attached Stylist notebooks as product references for separating
user constraints, wardrobe analysis, retrieval, and outfit simulation. Keep
the existing Next.js/Supabase pilot. Do not run or depend on the notebooks.

- Resolve today's occasion from an explicit choice, then Style DNA, then
  Everyday. Budget is an explicit opt-in for shopping. Daily uses no Gemini.
- Return one owned look selected from a short list of ranked core looks. Rotate
  by the Cairo calendar date when choices are available. This is request-time
  generation with no job, database writes, or guarantee of unseen outfits.
- Explain up to three needs as missing (a piece can enable the first complete
  look) or variety (a piece can add combinations). If more than one gap blocks
  a complete outfit, report the missing building blocks without shopping.
- Respect the existing retailer allowlist, verified offers, age and budget
  checks. Search only roles supported by wardrobe evidence. Use complete
  outfit simulation to qualify a product and show two distinct examples.
- Treat combination counts as structural potential, not fashion judgments
  or predictions of how often someone will wear a piece. Existing outfit
  scoring still ranks candidate looks.

Acceptance: stable within a Cairo day; occasion choice overrides Style DNA;
missing-shoe, multiple-gap, and one-piece cases; no budget means no buying;
no product without two distinct looks; and signed-in browser verification
with a reviewed catalog remains a Preview gate.

Roll back by disabling the existing Stylist flag or reverting this change.
Keep catalog ingestion and request-time matching separate. If the pilot
proves demand, add reviewed merchant feeds and measure freshness independently.

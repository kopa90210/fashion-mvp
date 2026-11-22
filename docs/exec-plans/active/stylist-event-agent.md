# StyleGraph event agent

Primary outcome: a user describes an event in one sentence and gets a plan
that starts with owned pieces. The three paths are: use an owned look;
review a close look against the dress code; or fill a single wardrobe gap
with a checked offer if the user supplies a budget. An urgent plan can use one
complete look. It never guarantees delivery or pickup.

Style identity comes from the existing Style Profile (style, fit, formality).
An event may change the recommendation, but does not overwrite the
long-term profile. Preview evidence: track whether a user chooses an owned
outfit, abandons the task, or needs more than one clarification.

## Catalog and worker

Treat the Lowqta workbook as a list of sourcing leads, not current offers.
Of the five links on an already supported retailer domain, four are for
children and the remaining one is leggings; none are a useful starter for
the interview footwear demo. Prioritize adult interview, dinner and wedding
coverage and source footwear separately. Publish only verified offers with
price, stock, collection and a review timestamp.

The next worker should verify official retailer feeds or approved retailer
pages independently of user requests, withdraw expired records, and track
variant size and store or delivery availability where a retailer provides it.
Catalog failures should leave the owned-wardrobe plan usable. It should publish
into a reviewed catalog store so updates do not require a Vercel redeploy.
Do not run a live store crawler in the user's request path.

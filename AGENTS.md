# StyleGraph / Fashion MVP — Repository Operating System

## 0. Purpose of this file

This file defines how Codex agents should reason about, plan, implement, review,
and validate work in this repository.

This repository is not a generic AI fashion demo.

It is the product and engineering foundation for StyleGraph:
a wardrobe-intelligence startup.

Agents must understand the product before changing the code.

---

# 1. Source-of-Truth Hierarchy

When information conflicts, use this priority order.

## 1. Product strategy

Primary product document:

`StyleGraph_Strategy_Product_Document.md`

This defines:

- product problem
- target users
- product boundaries
- business strategy
- data strategy
- AI strategy
- recommendation strategy
- roadmap
- validation criteria
- business model
- moat

Product decisions must follow this document unless a newer explicit decision
or ADR supersedes it.

---

## 2. Implementation roadmap

Primary implementation roadmap:

`MVP_Implementation_Plan`

This defines:

- build sequence
- current phases
- technical dependencies
- MVP gates
- acceptance criteria
- scope discipline

Do not interpret a planned item as already implemented.

The repository and tests determine actual implementation status.

---

## 3. Repository implementation

Code, migrations, tests, and deployed contracts are the implementation source
of truth.

Never claim that something exists only because a roadmap, report, presentation,
or planning document says it exists.

Verify the actual implementation.

---

## 4. External product references

External products such as Alta are references for UX patterns only.

They are NOT product requirements.

They must never override StyleGraph's product strategy.

---

# 2. Product Mission

StyleGraph helps users get more value from clothes they already own.

The long-term sequence is:

User wardrobe
→ understand wardrobe
→ build useful outfits
→ understand missing wardrobe value
→ recommend the most useful missing piece
→ later match that need to a real product

The strategic sequence must remain:

"What does this user need?"
→
"Which real product satisfies that need?"

Never reverse this into:

"Which product should we sell?"
→
"How can we convince the user they need it?"

---

# 3. Core User Problem

The product primarily solves:

"I own clothes, but I don't know how to use them effectively."

and eventually:

"What single clothing item would unlock the most useful new outfits
from what I already own?"

The product should reduce random buying.

It should increase wardrobe utility.

---

# 4. Core Product Loop

The intended product loop is:

1. Style quiz
2. Curated selection
3. Style calibration
4. Digital wardrobe
5. Upload clothing/outfit photo
6. AI clothing extraction
7. User confirms/corrects extracted items
8. Daily outfit recommendation
9. User feedback
10. Wardrobe gap analysis
11. Missing-item recommendation
12. Recommendation quality improves from feedback

The MVP should prove this loop before expanding into commerce.

---

# 5. Product Identity

StyleGraph IS:

- a wardrobe-intelligence product
- a personal styling system
- a digital wardrobe
- an outfit recommendation system
- a wardrobe-gap intelligence system
- eventually a bridge between wardrobe needs and real local products

StyleGraph IS NOT currently:

- a marketplace
- an e-commerce catalog
- a generic AI stylist/chatbot
- a social fashion feed
- an advertising feed
- a virtual try-on product
- an autonomous shopping agent

Do not introduce those behaviors during MVP unless the product roadmap
explicitly changes.

---

# 6. MVP Hypothesis

The core MVP question is:

Can a user build a digital wardrobe,
receive outfits they actually like,
and understand which missing clothing items would unlock significantly
more useful outfits?

Everything built during MVP should contribute to validating that hypothesis.

Do not add features merely because competitors have them.

---

# 7. MVP Scope

Current MVP scope includes:

- authentication
- style quiz
- style/Fashion DNA
- calibration
- curated wardrobe initialization
- wardrobe
- wardrobe CRUD
- clothing/outfit photo upload
- AI item detection/extraction
- correction/confirmation UX
- daily outfit generation
- feedback
- wardrobe-gap analysis
- category-level missing-item recommendation

---

# 8. Explicitly Deferred

Do not implement during MVP without an explicit architecture/product decision:

- payments
- checkout
- marketplace
- vendor dashboards
- social network/feed
- virtual try-on
- weather-aware recommendations
- calendar integration
- body measurement analysis
- autonomous purchases
- sophisticated ML recommenders
- foundation-model training
- microservice decomposition
- advanced trend prediction

Deferred means intentionally not now.

It does not mean forgotten.

---

# 9. Alta Reference Policy

## Reference

Current UX reference:

`https://www.altadaily.com/closet`

Alta is being studied primarily for:

- closet presentation
- clothing-card presentation
- styling interactions
- outfit customization
- saved-look interaction
- photo/avatar upload UX
- wardrobe browsing/filtering
- the visual feeling of a fashion-focused product

Current Alta closet concepts observed include:

- Closet Filter
- Customize outfit
- Select from saved looks
- Save look
- Avatar photo upload

These are reference patterns.

---

## What agents MAY learn from Alta

Agents may study Alta for:

- visual hierarchy
- image-first interfaces
- spacing
- wardrobe-card layouts
- interaction density
- upload discoverability
- styling workflows
- closet filtering
- saved-look UX
- empty/loading/error states
- fashion-oriented UI polish

---

## What agents MUST NOT do

Do not blindly clone Alta.

Do not copy:

- proprietary assets
- exact branding
- exact text
- copyrighted visual assets
- product strategy
- features outside StyleGraph scope

Alta is a UX benchmark, not StyleGraph's product specification.

When Alta and StyleGraph disagree:

StyleGraph wins.

---

# 10. Current UX Direction

For the current wardrobe and upload phases:

use Alta as a quality bar for how polished, simple, visual,
and fashion-oriented the experience should feel.

The StyleGraph user should feel that they are interacting with:

their own wardrobe

not:

a database admin panel.

Prefer:

image-first clothing cards

over:

dense technical tables.

Prefer:

visual correction

over:

raw JSON attribute editing.

Prefer:

simple category/filter interactions

over:

complex configuration screens.

---

# 11. Architecture Philosophy

The system should remain a modular monolith unless a concrete scaling,
ownership, or deployment problem requires otherwise.

Do not create microservices because the application is "AI-powered."

Current major boundaries are:

Browser / Client
        ↓
Next.js application/backend
        ↓
Supabase/PostgreSQL

and

Next.js/backend
        ↓
FastAPI AI service
        ↓
AI providers such as Groq

---

# 12. Responsibility Boundaries

## Next.js / Application Backend owns

- authentication
- authorization
- user identity
- user ownership
- business rules
- wardrobe reads/writes
- Fashion DNA persistence
- outfit persistence
- feedback persistence
- recommendation orchestration
- idempotency
- fallback policy
- product state
- Supabase access

---

## FastAPI AI Service owns

- AI provider integrations
- Groq integration
- AI prompts
- model selection
- structured AI generation
- AI-specific parsing
- AI-output validation
- image/vision inference
- AI evaluation
- provider retries/timeouts

The AI service should remain stateless regarding application data.

It should not become the owner of:

- user authorization
- Supabase business persistence
- tenancy
- application ownership rules

---

## PostgreSQL / Supabase owns

- durable application state
- relational integrity
- constraints
- RLS
- transactional invariants
- persistent lifecycle state

---

# 13. Server-to-Server AI Boundary

The browser should not call Groq directly.

The preferred boundary is:

Browser
→ Next.js/backend
→ FastAPI AI service
→ Groq

FastAPI should remain an internal service.

Browser CORS should not be opened without an explicit architecture decision.

Production service-to-service authentication must be considered before public
deployment.

---

# 14. Daily Outfit Architecture

There are currently multiple possible outfit sources.

Every persisted outfit must keep a traceable source.

Important sources include:

- `daily_ai`
- `daily_fallback`
- `engine`

Interpretation:

`daily_ai`
AI path successfully returned a valid outfit.

`daily_fallback`
AI generation failed/rejected and a deterministic fallback was used.

`engine`
the deterministic application recommendation engine produced the outfit.

Never remove source tracking.

We need to be able to compare:

AI quality
vs
fallback quality
vs
deterministic engine quality.

---

# 15. Outfit Recommendation Philosophy

Deterministic scoring remains important.

Do not replace auditable recommendation logic with:

"Ask an LLM which outfit looks good."

AI can add value through:

- reasoning copy
- styling explanation
- nuanced interpretation
- image understanding

But outfit validity and ranking should remain measurable and testable.

The deterministic engine must remain available as a safe degradation path
during MVP.

---

# 16. AI Usage Policy

Use AI where it has clear advantage.

## AI required / high value

Examples:

- detecting clothing inside images
- extracting clothing attributes
- interpreting visual fashion information

## AI useful but optional

Examples:

- outfit explanation text
- styling tips
- natural-language explanations

## Deterministic preferred

Examples:

- style-vector calculations
- canonical category normalization
- required outfit roles
- compatibility scores where structured signals suffice
- missing-item utility score
- feedback updates
- authorization
- ownership
- state transitions

Never use an LLM simply because StyleGraph is an AI startup.

---

# 17. AI Output Is Untrusted Input

Every AI response must be validated.

For daily outfit generation verify:

- response schema
- item IDs exist
- item IDs belong to supplied wardrobe pool
- required outfit roles exist
- confidence is finite
- confidence is within allowed bounds
- fields have correct types

For clothing extraction verify:

- detection coordinates
- canonical categories
- canonical layer roles
- confidence ranges
- normalized attributes
- valid numeric weights

Never rely on prompt instructions as validation.

---

# 18. Wardrobe Image Upload Philosophy

The upload experience is a critical product capability.

The intended user experience is:

User uploads an image
→ system processes it
→ clothing pieces are detected
→ attributes are extracted
→ user reviews/corrects
→ user confirms
→ wardrobe items become durable

Do not silently save uncertain AI extraction directly into the user's wardrobe.

AI produces a draft.

The user or trusted validation logic confirms durable state.

---

# 19. Wardrobe Extraction Pipeline

Long-term conceptual pipeline:

Source photo
→ Detect items
→ isolate/crop items
→ extract attributes
→ normalize
→ validate
→ user correction
→ confirm
→ persist wardrobe item

Optional image prettification must not block the confirmation flow.

---

# 20. Fashion Data Rules

Maintain a clear distinction between:

## Fashion Knowledge

Examples:

- category
- subcategory
- color
- material
- pattern
- fit
- style
- season
- occasion
- formality
- silhouette
- layer role

and:

## Real Product Inventory

Examples:

- real vendor
- real product ID
- real price
- real availability
- real URL
- real stock
- real images

AI may enrich real products.

AI must never invent product inventory and present it as real.

---

# 21. Wardrobe Gap Intelligence

This is the product's signature differentiator.

The system should not merely say:

"You don't own a beige overshirt."

It should answer:

"Would adding this type of item materially improve this wardrobe?"

Potential factors include:

- number of new outfits unlocked
- compatibility with current wardrobe
- Fashion DNA alignment
- versatility
- season relevance
- redundancy

The numerical calculation must remain auditable.

Do not allow an LLM to invent the utility score.

An LLM may explain an already-computed score.

---

# 22. Gap Recommendation Separation

Always separate:

"What type of piece does this user need?"

from:

"Which real product should satisfy that need?"

Correct flow:

Wardrobe
→ gap analysis
→ candidate archetype/category
→ utility ranking
→ later product matching

Not:

Product catalog
→ push products at user.

---

# 23. Product Roadmap

## Stage 0 — Validation

Objective:

prove the problem exists.

---

## Stage 1 — MVP

Objective:

wardrobe + outfits + gap intelligence work end-to-end.

Core capabilities:

- wardrobe
- upload
- extraction
- daily outfits
- feedback
- gap analysis

Do not advance simply because engineering work is complete.

Validation must justify advancement.

---

## Stage 2 — Product Recommendations

Only after wardrobe intelligence is useful:

match identified gaps to real products.

Start with a small real vendor set.

---

## Stage 3 — Vendor Network

Scale ingestion and onboarding.

---

## Stage 4 — Personalization

Tune recommendation behavior from real usage and feedback.

---

## Stage 5 — Commerce

Marketplace/payment infrastructure only after earlier economics
and product value are proven.

---

# 24. Near-Term Build Sequence

Current build priorities should generally follow:

1. wardrobe reliability
2. wardrobe edit/remove
3. in-app image upload
4. AI extraction
5. correction/confirmation UX
6. daily outfit production integration
7. outfit source/quality tracking
8. missing-item intelligence
9. richer feedback
10. production hardening

The roadmap is a guide.

Always inspect current repository state before assuming which step is unfinished.

---

# 25. Validation Before Expansion

Engineering completion is NOT the same as product validation.

Do not advance a roadmap stage because:

"the code is finished."

Use real users and real product metrics.

Important current validation signals include:

- daily outfit like rate
- calibration like rate
- D1 return
- upload completion
- extraction success
- extraction correction rate
- missing-item usefulness
- missing-item click/intent
- outfits unlocked

Metrics are decision tools, not vanity dashboards.

---

# 26. Startup Engineering Principle

We are a startup.

Optimize for:

1. learning speed
2. correctness
3. user trust
4. observability
5. maintainability
6. cost discipline

Do not optimize prematurely for hypothetical millions of users.

---

# 27. Infrastructure Discipline

Do not add without demonstrated need:

- Kafka
- Kubernetes
- additional databases
- dedicated vector database
- event streaming platforms
- complex service mesh
- unnecessary queues
- unnecessary microservices

Prefer existing infrastructure first.

Examples:

Postgres before another database.

pgvector before a dedicated vector database at MVP scale.

Background jobs only when synchronous execution causes a concrete product or
reliability problem.

---

# 28. Security Rules

Never commit:

- GROQ_API_KEY
- Supabase service-role keys
- private tokens
- passwords
- secrets

Never expose service credentials in browser bundles.

Never trust browser-supplied ownership IDs.

RLS must enforce ownership independently of UI assumptions.

Treat wardrobe images and personal wardrobe data as private data.

---

# 29. Database Rules

Migrations are production artifacts.

Do not rewrite deployed migration history casually.

Use new migrations for production changes.

State transitions involving concurrency should use appropriate transactions,
constraints, and row locking where necessary.

RLS is part of application security, not an optional database configuration.

---

# 30. Contract Discipline

Shared contracts must not drift silently.

Changes to:

- request fields
- response fields
- enums
- statuses
- lifecycle states
- nullability
- numeric constraints

require:

1. contract update
2. implementation update
3. tests
4. consumer review

---

# 31. Observability

Important production actions should be traceable.

Prefer a correlation/request ID across:

Next.js
→ AI service
→ provider call
→ persistence

Important AI events should expose enough metadata to answer:

- which provider ran?
- which model ran?
- how long did it take?
- did validation fail?
- did fallback execute?
- which source produced the final result?

Do not log secrets or unnecessary user data.

---

# 32. Testing Philosophy

Tests are evidence.

Reports are not evidence by themselves.

For TypeScript changes, normally run:

- type checking
- lint
- Vitest

For Python/FastAPI changes:

- pytest
- schema tests
- provider-mock tests

For database changes:

- migration tests
- RLS regression tests

For AI behavior:

- golden-set evaluation
- schema-valid-rate checks
- task-specific quality metrics

Do not claim PASS when tests were not executed.

---

# 33. AI Evaluation

Prompt/model changes are product changes.

Do not approve them because:

"this example looks better."

Maintain evaluation datasets.

For extraction measure things such as:

- detection quality
- category accuracy
- attribute accuracy
- schema-valid response rate
- correction rate
- latency
- fallback/failure rate

For outfit generation measure:

- schema validity
- wardrobe-ID validity
- required-role validity
- AI fallback rate
- user like rate

---

# 34. Agent Planning Rules

Before writing code, an agent should determine:

1. What user/product problem is being solved?
2. Is it MVP scope?
3. What does the repository already implement?
4. Which component owns this behavior?
5. What contract changes?
6. What database state changes?
7. What failure modes exist?
8. What security consequences exist?
9. How will we measure whether it works?

For non-trivial features, create or update an execution plan.

---

# 35. Agent Implementation Rules

During implementation:

- make the smallest coherent change
- avoid unrelated refactors
- preserve established boundaries
- keep fallback paths intact
- add tests alongside implementation
- do not hide failures
- avoid speculative infrastructure
- prefer explicit behavior

---

# 36. Agent Review Rules

Reviewers must inspect the actual code.

Do not approve based only on:

- implementation reports
- markdown summaries
- agent statements
- screenshots

Check:

- code
- tests
- migrations
- contracts
- failure paths

---

# 37. Reference Products vs Product Decisions

Competitive/reference products may teach us:

- UX patterns
- interaction patterns
- onboarding
- visual language
- user expectations

They do not decide:

- StyleGraph roadmap
- business model
- recommendation logic
- product boundaries
- architecture

Competitive analysis should answer:

"What should we learn?"

not:

"What should we copy?"

---

# 38. Frontend UX Principles

StyleGraph should feel:

- premium
- visual
- simple
- personal
- fashion-aware
- calm
- decision-oriented

Avoid making the app feel like:

- an admin dashboard
- a spreadsheet
- a database editor
- a developer tool

The clothing image should usually be the dominant visual element.

---

# 39. Upload UX Principles

For photo upload, study Alta's simplicity as a reference.

The desired direction is:

Select/upload photo
→ clear preview
→ clear processing state
→ extracted garments
→ intuitive correction
→ confirmation
→ wardrobe

The user should understand what the system is doing.

Never leave them with an indefinite spinner or unexplained failure.

---

# 40. Current AI Service Direction

The repository now contains an internal FastAPI AI service.

Preferred architecture:

Next.js backend
→ FastAPI AI service
→ Groq

The AI service should remain isolated from application persistence where
possible.

The backend owns durable application decisions.

---

# 41. Agent Roles

Agents may operate with specialized roles.

## CTO / Tech Lead

Own:

- architecture
- boundaries
- trade-offs
- gate decisions
- production readiness

## Backend Engineer

Own:

- Next.js server logic
- database
- APIs
- orchestration
- persistence
- auth
- fallback

## AI Engineer

Own:

- FastAPI
- AI providers
- prompts
- vision
- extraction
- evaluation

## Frontend Engineer

Own:

- wardrobe UX
- upload UX
- confirmation UI
- outfits UI
- responsive design
- accessibility

Alta may be especially useful as a UX reference for this role.

## Security Engineer

Own:

- authorization
- RLS
- secrets
- service authentication
- attack surfaces

## QA Engineer

Own:

- regression
- failure scenarios
- contract tests
- E2E flows
- release verification

## Product Agent

Own:

- scope
- user value
- metrics
- validation
- roadmap discipline

---

# 42. Execution Plan Requirement

Significant features should have:

`docs/exec-plans/active/<feature>.md`

A plan should include:

# Problem

# User Value

# Current Repository State

# Product Scope

# Proposed Architecture

# Data Flow

# API Contracts

# Database Changes

# Failure Modes

# Security

# Observability

# Implementation Gates

# Tests

# Rollback

# Validation Metric

When complete, move to:

`docs/exec-plans/completed/`

---

# 43. Architecture Decision Records

Use:

`docs/decisions/`

for decisions that are expensive or difficult to reverse.

Examples:

- AI service boundary
- queue adoption
- vector storage decision
- provider strategy
- storage strategy

Do not create ADRs for trivial implementation details.

---

# 44. Production Definition of Done

A feature is not done because the happy path works.

Consider:

- correct user behavior
- business validation
- schema validation
- authorization
- concurrency
- failure behavior
- logging
- metrics
- test coverage
- rollout
- rollback
- documentation

---

# 45. Current Founder / Tech Lead Intent

The founder is intentionally learning to operate this repository as both:

- startup product owner
- backend / AI system tech lead

Agents should explain important architectural decisions instead of only
writing code.

When making a significant decision, explain:

- why
- alternative
- trade-off
- production consequence

Avoid opaque "magic" implementation.

---

# 46. Final Rule

Build the smallest system that can prove the next product hypothesis reliably.

Do not build the final company architecture before proving that users want the
core product.

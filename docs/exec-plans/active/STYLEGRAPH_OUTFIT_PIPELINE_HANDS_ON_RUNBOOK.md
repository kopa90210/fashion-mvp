# StyleGraph — Outfit Photo Pipeline Hands-On Runbook

> Audience: junior developer learning the system by running it with their own hands.
> Branch: `outfit_pipeline_recovered`
> Goal: upload one outfit photo from StyleGraph, process it through the Colab GPU pipeline over ngrok, receive separate garment drafts, review/edit them, and explicitly add selected garments to the wardrobe.

---

# 0. The system in one picture

Think of the pipeline as six people passing a package:

```text
1. Browser / Next.js
   "The user uploaded this outfit photo."
            |
            v
2. Supabase
   Stores the source photo + creates an AI job.
            |
            v
3. Python worker on your PC
   Claims the job and fetches the private photo.
            |
            v
4. ngrok
   Temporary HTTPS tunnel from your PC/worker to Colab.
            |
            v
5. Colab GPU bridge
   YOLOS -> SAM -> optional FLUX -> Qwen metadata
            |
            v
6. Python worker -> Supabase
   Validates output, stores private garment images,
   completes the job, creates draft wardrobe items.
            |
            v
7. Next.js review screen
   User edits / compares / adds / skips each garment.
```

Important ownership rule:

```text
Browser NEVER calls Colab directly.
Browser NEVER knows the pipeline token.
Colab NEVER receives the Supabase service key.
Worker is the trusted bridge between Supabase and Colab.
```

---

# 1. Mission-control files

Keep these files open while working:

```text
AGENTS.md

docs/exec-plans/active/outfit-photo-extraction.md
docs/outfit-photo-colab.md
docs/migration-ledger/outfit-pipeline-readiness.md

ai_service/notebook_outfit_bridge.py
ai_service/outfit_photo_worker.py
ai_service/worker.py

src/app/actions/wardrobe.ts
src/app/(app)/wardrobe/add/UploadScreen.tsx
src/app/(app)/wardrobe/add/review/[photoId]/ReviewOutfitScreen.tsx

.env.local
```

This file itself should live at:

```text
docs/exec-plans/active/outfit-photo-live-validation-runbook.md
```

Use it as your checklist. Do not keep critical commands only in chat history.

---

# 2. Golden rule for this exercise

We do NOT try to solve every part at once.

We prove one boundary at a time:

```text
A. Local repository tests work
B. Database job system works
C. Colab AI works by itself
D. Colab FastAPI bridge works
E. ngrok reaches the bridge
F. Worker reaches ngrok
G. Worker completes a real DB job
H. Next.js UI shows the result
I. Alta-inspired UX polish
```

Never continue to the next checkpoint when the current checkpoint is red.

---

# 3. STEP A — Prepare the local repository

## Why

Before testing GPU or ngrok, prove that the software wrapper around them works with fake data.

If this step fails, Colab will only make debugging harder.

## PowerShell

Open PowerShell in the repository:

```powershell
git fetch origin
git switch outfit_pipeline_recovered
git status
git branch --show-current
```

Expected branch:

```text
outfit_pipeline_recovered
```

Check installed runtimes:

```powershell
python --version
node --version
npm --version
```

Install Python service dependencies:

```powershell
python -m pip install -r ai_service/requirements.txt
```

Run the bridge and worker tests:

```powershell
python -m pytest `
  ai_service/tests/test_notebook_outfit_bridge.py `
  ai_service/tests/test_outfit_photo_worker.py `
  -q
```

## PASS means

The tests finish green.

These tests prove:

- bridge authentication works;
- crop/box contract works;
- reconstruction may fail without losing the original crop;
- malformed metadata can remain reviewable;
- worker rejects malformed provider output;
- worker can consume the bridge contract without a GPU.

## STOP if

- imports fail;
- pytest is not found;
- any bridge/worker tests fail.

Do not start Colab until this is green.
-completed this step
[✓] Correct Git branch
[✓] Python requirements installed
[✓] Bridge tests pass
[✓] Worker tests pass
---

# 4. STEP B — Prepare `.env.local`

## Why

The worker needs server-side secrets, but the browser must never receive them.

Open:

```text
.env.local
```

Never commit this file.

You will eventually need:

```dotenv
# Existing application
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

GROQ_API_KEY=
GROQ_VISION_MODEL=

# Outfit photo feature
ENABLE_OUTFIT_PHOTO_UPLOAD=false

# Temporary Colab bridge
OUTFIT_PIPELINE_URL=
OUTFIT_PIPELINE_TOKEN=
OUTFIT_PIPELINE_MODEL=yolos-sam2-flux2-qwen3vl
```

Rules:

```text
OUTFIT_PIPELINE_TOKEN must NOT start with NEXT_PUBLIC_
SUPABASE_SERVICE_KEY must NOT start with NEXT_PUBLIC_
GROQ_API_KEY must NOT start with NEXT_PUBLIC_
```

At this point leave:

```dotenv
ENABLE_OUTFIT_PHOTO_UPLOAD=false
OUTFIT_PIPELINE_URL=
```

We enable them only after the lower layers work.

---

# 5. STEP C — Database safety checkpoint

## Why

The branch contains a durable AI job system:

```text
source_photos
media_assets
ai_jobs
ai_runs
```

and RPCs such as:

```text
enqueue_outfit_photo_job
claim_ai_jobs
complete_outfit_photo_job
confirm_outfit_photo_draft
```

Your repository readiness document says the configured database has schema/ledger inconsistencies and some job-pipeline objects were not yet present.

Therefore:

DO NOT blindly run all migrations against the real project.

## Beginner recommendation

Use a disposable Supabase project for this first live pipeline test.

Purpose:

```text
learn pipeline
+
prove migrations
+
avoid damaging real data
```

Later we reconcile the production database separately.

## Checkpoint

Before continuing, verify the disposable database contains:

```text
ai_jobs
ai_runs
source_photos
media_assets
```

and RPCs:

```text
enqueue_outfit_photo_job
claim_ai_jobs
complete_outfit_photo_job
confirm_outfit_photo_draft
```

Do not enable the frontend before this checkpoint passes.

---

# 6. STEP D — Prepare Colab

## Why

Your laptop does not need to run the GPU models.

Colab will be the temporary GPU computer.

The notebook already contains:

```text
YOLOS Fashionpedia -> detection
SAM 2.1 -> segmentation / transparent crops
FLUX.2 Klein -> optional reconstruction
Qwen3-VL -> metadata extraction
```

## Important

Do NOT run the notebook's old FastAPI/ngrok API cells for production-style integration.

The old endpoint is:

```text
/extract-metadata
```

We instead use the repository wrapper:

```text
ai_service/notebook_outfit_bridge.py
```

which exposes:

```text
GET  /health
POST /v1/outfit-extract
```

with an internal token.

---

# 7. STEP E — Open the notebook and run model setup

Open your notebook in Google Colab.

Choose a GPU runtime.

Run the package/setup cells and model-loading cells until all of these Python names exist:

```python
models
segment_outfit
reconstruct_image
MetaDataExtractor_Per_Garment
```

Quick check cell:

```python
print(type(models))
print(segment_outfit)
print(reconstruct_image)
print(MetaDataExtractor_Per_Garment)
```

If one prints `NameError`, go back and run the cell that defines it.

## Metadata generation change for the experiment

Inside `MetaDataExtractor_Per_Garment`, find:

```python
generated_ids = model.generate(**inputs, max_new_tokens=128)
```

For the quality test change it to:

```python
generated_ids = model.generate(**inputs, max_new_tokens=512)
```

Why:

The requested JSON object is much larger than a short sentence. A small token limit can truncate valid JSON.

We are testing whether the higher budget improves valid structured output and what latency it costs.

---

# 8. STEP F — Put the repository code inside Colab

## Why

Colab needs to import:

```python
ai_service.notebook_outfit_bridge
```

The easiest repeatable approach is to clone the branch into Colab.

Run:

```python
!git clone -b outfit_pipeline_recovered https://github.com/kopa90210/fashion-mvp.git /content/fashion-mvp
```

If the folder already exists:

```python
%cd /content/fashion-mvp
!git fetch origin
!git switch outfit_pipeline_recovered
!git pull --ff-only
```

Then add it to Python's import path:

```python
import sys
sys.path.insert(0, "/content/fashion-mvp")
```

Test:

```python
from ai_service.notebook_outfit_bridge import create_app
print("bridge import OK")
```

PASS:

```text
bridge import OK
```

---

# 9. STEP G — Add Colab secrets

## Why

Secrets should not be pasted into notebook source code or Git.

In Colab:

```text
left sidebar
-> key/secrets icon
-> Add new secret
```

Create:

```text
OUTFIT_PIPELINE_TOKEN
NGROK_AUTHTOKEN
```

`OUTFIT_PIPELINE_TOKEN`:

- create a long random value;
- at least 24 characters;
- this same value will later be placed in local `.env.local`;
- do not print it.

`NGROK_AUTHTOKEN`:

- comes from your ngrok account;
- do not print it.

Test that the names exist without printing values:

```python
from google.colab import userdata

assert userdata.get("OUTFIT_PIPELINE_TOKEN")
assert userdata.get("NGROK_AUTHTOKEN")

print("Secrets loaded")
```

Expected:

```text
Secrets loaded
```

---

# 10. STEP H — Install the bridge dependencies in Colab

Run:

```python
!pip install -q fastapi "uvicorn[standard]" python-multipart pyngrok pillow
```

Why:

The AI models are already installed by the notebook.

These packages only serve the model functions as an HTTP API.

---

# 11. STEP I — Start the repository FastAPI bridge

Run a NEW cell:

```python
from google.colab import userdata
from ai_service.notebook_outfit_bridge import create_app
import threading
import uvicorn

bridge = create_app(
    token=userdata.get("OUTFIT_PIPELINE_TOKEN"),
    segmenter=lambda image: segment_outfit(
        image,
        models,
        return_details=True,
    ),
    reconstructor=reconstruct_image,
    metadata_extractor=MetaDataExtractor_Per_Garment,
)

threading.Thread(
    target=lambda: uvicorn.run(
        bridge,
        host="0.0.0.0",
        port=8000,
        log_level="warning",
    ),
    daemon=True,
).start()

print("Bridge started on Colab port 8000")
```

What just happened:

```text
Your notebook functions did not become a new application.

We wrapped them.

FastAPI receives an image
-> validates it
-> calls segment_outfit()
-> calls reconstruct_image()
-> calls MetaDataExtractor_Per_Garment()
-> converts results into the stable outfit-v1 contract
```

PASS:

```text
Bridge started on Colab port 8000
```

---

# 12. STEP J — Test the bridge locally inside Colab

Before ngrok, test port 8000 from inside Colab.

```python
import requests

response = requests.get("http://127.0.0.1:8000/health")
print(response.status_code)
print(response.json())
```

Expected:

```text
200
{'status': 'ready', 'contract': 'outfit-v1'}
```

If this fails, ngrok is NOT the problem.

Fix FastAPI first.

---

# 13. STEP K — Start ngrok

## What ngrok is

Colab's port 8000 is private.

Your Windows worker cannot reach:

```text
http://127.0.0.1:8000
```

because that address belongs to the Colab machine.

ngrok gives Colab port 8000 a temporary public HTTPS address:

```text
https://random-name.ngrok-free.app
                |
                v
        Colab localhost:8000
```

Run:

```python
from pyngrok import ngrok
from google.colab import userdata

ngrok.kill()
ngrok.set_auth_token(userdata.get("NGROK_AUTHTOKEN"))

tunnel = ngrok.connect(8000)
bridge_url = tunnel.public_url

print("Bridge URL:", bridge_url)
```

It is safe to copy the HTTPS URL.

Do NOT print the pipeline token.

Expected:

```text
Bridge URL: https://something.ngrok-free.app
```

---

# 14. STEP L — Test ngrok from your Windows PC

Open PowerShell.

Replace only the URL:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "https://YOUR-NGROK-URL/health"
```

Expected:

```text
status contract
------ --------
ready  outfit-v1
```

This proves:

```text
Windows
-> Internet
-> ngrok
-> Colab
-> FastAPI
```

No database involved yet.

---

# 15. STEP M — Configure the local worker

Now update local `.env.local`:

```dotenv
OUTFIT_PIPELINE_URL=https://YOUR-NGROK-URL
OUTFIT_PIPELINE_TOKEN=<same value stored in Colab secret>
OUTFIT_PIPELINE_MODEL=yolos-sam2-flux2-qwen3vl
```

Do not paste the token into chat.

Do not commit `.env.local`.

Restart local processes after editing env values.

---

# 16. STEP N — Understand the worker before starting it

File:

```text
ai_service/worker.py
```

The worker is NOT an API server.

It is a background process.

Its loop is approximately:

```text
claim_ai_jobs()
        |
        v
job_type == outfit_photo?
        |
        v
fetch source photo from private Supabase Storage
        |
        v
call OUTFIT_PIPELINE_URL/v1/outfit-extract
        |
        v
validate response
        |
        v
upload generated PNGs to private storage
        |
        v
complete_outfit_photo_job(...)
```

The worker is allowed to hold:

```text
SUPABASE_SERVICE_KEY
OUTFIT_PIPELINE_TOKEN
GROQ_API_KEY
```

The browser is not.

---

# 17. STEP O — Start worker in safe one-job mode

Before a continuous worker, use:

```powershell
python -m ai_service.worker --once
```

Why:

`--once` means:

```text
claim at most one job
-> process it
-> exit
```

This is much easier to debug.

Later:

```powershell
python -m ai_service.worker --poll-seconds 5
```

means:

```text
stay alive
-> check every 5 seconds
-> process new jobs
```

---

# 18. STEP P — Enable the frontend only after worker readiness

After database + Colab + ngrok + worker are known-good:

```dotenv
ENABLE_OUTFIT_PHOTO_UPLOAD=true
```

Restart Next.js:

```powershell
npm run dev
```

Go to:

```text
Wardrobe
-> Add
-> Full outfit
```

Upload ONE consented test image first.

Do not batch-test yet.

---

# 19. STEP Q — Follow one photo manually

When you upload, mentally follow this state:

```text
A. Next.js uploadOutfitPhoto()
        |
        v
B. private source image stored
        |
        v
C. source_photos row
        status = uploading
        |
        v
D. enqueue_outfit_photo_job()
        |
        v
E. source status = detecting
        |
        v
F. worker claims ai_jobs row
        |
        v
G. worker calls Colab
        |
        v
H. Colab returns garments
        |
        v
I. worker uploads PNG artifacts
        |
        v
J. complete_outfit_photo_job()
        |
        v
K. separate draft wardrobe_items created
        |
        v
L. source photo = done
        |
        v
M. review page displays garments
```

This is the first real victory.

---

# 20. STEP R — Review UX expected behavior

For each garment:

```text
Default:
segmented original crop

Editable:
name
category
color
brand

Optional:
compare reconstructed/prettified image

Actions:
Add to closet
Skip
```

Never auto-confirm AI garments.

The user is the final confirmation boundary.

---

# 21. STEP S — What happens when things fail

## Colab disconnects

Expected:

```text
source photo remains stored
job can retry
no garment is silently confirmed
```

## FLUX reconstruction fails

Expected:

```text
segmented crop remains usable
user can still Add
```

## Qwen metadata JSON is invalid

Expected:

```text
segmented crop remains reviewable
metadata can be manually corrected
```

## ngrok URL changes

Expected:

```text
update OUTFIT_PIPELINE_URL
restart worker
```

## token is wrong

Expected bridge result:

```text
401 Unauthorized
```

Do not weaken authentication to fix this.

---

# 22. STEP T — First quality test set

After one image works end-to-end, use a small controlled set.

Suggested coverage:

```text
simple 2-piece outfit
3-piece outfit
outerwear
shoes
bag/accessory
light clothing
dark clothing
busy background
partially hidden garment
similar overlapping garments
```

Record for each image:

```text
expected garment count
detected garment count
missed garments
duplicates
segmentation quality
metadata corrections
prettify accepted?
total time
```

---

# 23. What NOT to optimize yet

Do not start with:

```text
Kubernetes
production GPU autoscaling
multiple workers
Redis
Kafka
vendor ingestion
complex retries
pixel-perfect Alta clone
```

First prove:

```text
one real upload
-> one real job
-> one Colab inference
-> separate drafts
-> user confirms a garment
```

Then improve.

---

# 24. Your first-day checklist

Mark these manually:

```text
[ ] Correct Git branch
[ ] Python requirements installed
[ ] Bridge tests pass
[ ] Worker tests pass

[ ] Disposable DB ready
[ ] Job tables/RPCs verified

[ ] Colab GPU selected
[ ] YOLOS/SAM loaded
[ ] FLUX loaded
[ ] Qwen loaded
[ ] max_new_tokens raised for test

[ ] Repository cloned into Colab
[ ] bridge import works
[ ] Colab secrets added
[ ] FastAPI bridge starts
[ ] local Colab /health returns 200

[ ] ngrok tunnel created
[ ] Windows can reach ngrok /health

[ ] `.env.local` updated without exposing token
[ ] worker --once starts

[ ] frontend feature enabled
[ ] one photo uploaded
[ ] worker processes the job
[ ] review screen shows separated garments
[ ] one garment added
[ ] one garment skipped
```

---

# 25. How to work with your mentor / agent

At every checkpoint send only:

```text
STEP:
COMMAND I RAN:
OUTPUT:
WHAT I EXPECTED:
SCREENSHOT (when useful):
```

Do not send secrets.

Example:

```text
STEP: A
COMMAND I RAN:
python -m pytest ai_service/tests/test_notebook_outfit_bridge.py ai_service/tests/test_outfit_photo_worker.py -q

OUTPUT:
9 passed

WHAT I EXPECTED:
tests green
```

Then move to the next checkpoint.

This prevents jumping between Colab, ngrok, Supabase, Next.js, and Python when only one layer is broken.

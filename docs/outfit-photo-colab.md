# Testing outfit-photo extraction from Colab

The outfit-photo feature is a **local draft**. Its migrations depend on the unapplied Gate 2–5 work and must first be verified on a disposable database. Do not point the worker at production until that is done.

The supplied `Outvira_Full_Pipeilne_from_outfit_Metadata_Development.ipynb` provides YOLOS/Fashionpedia detection, SAM 2.1 segmentation, optional FLUX.2 Klein reconstruction, and Qwen3-VL metadata. Its existing `/extract-metadata` endpoint only returns a JSON string, has no authentication, and omits crop images and boxes. Use the repository's `ai_service/notebook_outfit_bridge.py` instead. The bridge converts notebook functions into the `outfit-v1` contract and keeps a segmented crop even if reconstruction fails.

1. Make the repository available in Colab and run the notebook's model-loading and function cells through `MetaDataExtractor_Per_Garment`. Do **not** run its old FastAPI/ngrok cells. Add `OUTFIT_PIPELINE_TOKEN` and `NGROK_AUTHTOKEN` to Colab Secrets. Use a long random pipeline token; never paste it into a cell or output.
2. In a new Colab cell, run:

```python
from google.colab import userdata
from ai_service.notebook_outfit_bridge import create_app
import threading
import uvicorn
from pyngrok import ngrok

bridge = create_app(
    token=userdata.get("OUTFIT_PIPELINE_TOKEN"),
    segmenter=lambda image: segment_outfit(image, models, return_details=True),
    reconstructor=reconstruct_image,
    metadata_extractor=MetaDataExtractor_Per_Garment,
)
threading.Thread(
    target=lambda: uvicorn.run(bridge, host="0.0.0.0", port=8000, log_level="warning"),
    daemon=True,
).start()
ngrok.set_auth_token(userdata.get("NGROK_AUTHTOKEN"))
url = ngrok.connect(8000).public_url
print("Bridge URL:", url)  # This URL is temporary; never print the token.
```

The repo must be on Colab's Python path for the import to work. `pyngrok`, `python-multipart`, Pillow, FastAPI, and uvicorn must be installed in Colab. The notebook's Torch/Transformers/Diffusers dependencies remain in Colab, not the Next.js app.

The notebook currently calls Qwen with `max_new_tokens=128` while asking for a long metadata object. That can truncate JSON. For quality testing, raise that budget in the notebook metadata function (for example, to 512) and measure schema-valid output rate and latency. If metadata is invalid, the bridge keeps the segmented garment and the user can correct its name/category instead of silently losing the piece.

3. On the worker host, set `OUTFIT_PIPELINE_URL` to the temporary HTTPS URL and `OUTFIT_PIPELINE_TOKEN` to the same secret. Set `SUPABASE_SERVICE_KEY`, `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), `GROQ_API_KEY`, and `GROQ_VISION_MODEL` as described in `.env.example`. Start `python -m ai_service.worker` on a host that can reach Supabase and the bridge. The browser and Colab do **not** receive the Supabase service key.
4. After disposable database validation, enable `ENABLE_OUTFIT_PHOTO_UPLOAD=true` in Next.js. Upload a consented outfit photo through **Wardrobe → Add → Full outfit**. The review page should show source upload, processing, separate original crops, optional reconstructions, correction fields, and explicit Add/Skip buttons.

If Colab disconnects, the job retries within its bounded attempts and then enters dead letter. Source images remain private. A service operator can requeue a dead-letter job after restoring the endpoint. The endpoint URL changes when the tunnel changes; update the worker variable. Never put the ngrok URL or token in a `NEXT_PUBLIC_*` variable.

Colab and Kaggle notebook sessions are useful for controlled quality and integration tests, but their interactive runtimes and tunnel processes are not an availability guarantee for real users. Colab's managed-runtime policy also restricts web-service usage, particularly on the free tier; use this tunnel only for an interactive test session, not a public user-facing service. For production, run the same versioned bridge on an always-on GPU container or managed inference host, keep the durable worker separate, use a stable HTTPS address, and measure latency, correction rate, model cost, and reconstruction fidelity. Reconstructed imagery may infer unseen clothing details; the segmented crop must remain the default and the user must choose the reconstructed view.

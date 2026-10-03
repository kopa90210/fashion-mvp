V1 — Research / fallback pipeline

Architecture:
Next.js
→ Supabase
→ Python worker
→ ngrok
→ Colab FastAPI
→ YOLOS
→ SAM
→ Qwen
→ outfit-v1
→ Supabase drafts

Required:
- local Supabase
- Python worker
- Colab notebook
- ngrok
- OUTFIT_PIPELINE_TOKEN
- GROQ/Qwen configuration

Run:
1. npx supabase start
2. npm run dev
3. start Colab pipeline
4. start ngrok
5. python -m ai_service.worker --poll-seconds 2
6. upload full outfit

Known limitations:
- GPU/Colab dependency
- ngrok dependency
- higher latency
- false detections possible
- prettify disabled
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Daily outfits through FastAPI

Run the Python service with its Groq configuration (from the repository root):

```bash
python -m uvicorn ai_service.main:app --host 127.0.0.1 --port 8000
```

Set these server-side values in Next.js .env.local and restart Next.js:

```dotenv
ENABLE_AI_DAILY_OUTFITS=true
AI_OUTFIT_SERVICE_URL=http://127.0.0.1:8000
AI_OUTFIT_SERVICE_TIMEOUT_MS=15000
```

Use the service's reachable base URL when deploying separately; localhost only works on the same host. No browser request or Supabase credentials are sent to FastAPI.

getDailyOutfit first reuses today's stored daily_ai/daily_fallback outfit. On a cache miss, Next.js sends the authenticated user's wardrobe and Fashion DNA to POST /generate-outfit, validates the selected IDs and roles, then saves its reasoning, styling tip, confidence, and source. FastAPI currently retains its own deterministic fallback. HTTP errors, timeouts, malformed responses, or a missing service URL use the Next.js recommendation engine and persist daily_fallback. With the feature flag off, the existing engine path persists engine. Calibration and other recommendation actions keep using the engine.

To verify a fresh generation, use a user without a stored daily outfit today. Check the new outfits row's source and the FastAPI request logs. A cached daily_fallback is also reused until the next day. Automated tests mock HTTP and Supabase; they do not prove live Groq connectivity.

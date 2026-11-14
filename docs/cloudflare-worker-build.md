# Cloudflare Worker build

The Cloudflare Worker is `fashion-mvp`. Keep the `WORKER_SELF_REFERENCE` service target equal to the Worker name in `wrangler.jsonc`. The npm package retains its existing name. Wrangler's custom build runs OpenNext before bundling.

To validate the bundle without publishing it, use Node 22 and run `npm ci`, then `npx wrangler deploy --config wrangler.jsonc --dry-run`. Use test values for build-time variables if needed. The reported bindings should include `WORKER_SELF_REFERENCE (fashion-mvp)`, `IMAGES`, and `ASSETS`.

In the Cloudflare dashboard for `fashion-mvp`, under **Settings → Build**:

- Keep Node 22. Leave the build command empty to avoid building twice.
- For Workers Preview Builds, use `npx wrangler preview` as the preview command. Check the Preview settings for required bindings and runtime variables, then verify the build from a branch other than the Worker’s production branch.
- For a future production rollout, use `npx wrangler deploy --config wrangler.jsonc` as the deploy command. Select the intended production branch before enabling automatic production builds.

Set deployment values in the Cloudflare environment. Next.js public variables are needed at build time; configure runtime variables and secrets separately as required. Keep local `.dev.vars` files out of Git. The Python photo extraction worker is a separate service.

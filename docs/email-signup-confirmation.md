# Email signup confirmation

Signup and `/auth/confirm` both use the existing Supabase SSR cookie client.
A pending signup displays **Check your email**. Only a returned session enters
`/quiz`. Expired/invalid links return to signup with a friendly message; email
rate limits ask the user to wait and never trigger automatic retries.

## Local and Preview setup

Set server-side `APP_ORIGIN` to the app origin, for example
`https://your-preview.example.com`. Do not include a path or trailing query.
Local development defaults to `http://localhost:3000`. Hosted environments fail
closed with a friendly signup error if `APP_ORIGIN` is missing or invalid.
This value is separate from `NEXT_PUBLIC_SUPABASE_URL`.

For the Supabase project used by Preview, allow the exact
`<APP_ORIGIN>/auth/confirm` in Auth redirect URLs. The Confirm signup email
template must link to the app's token-hash handler, for example:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}">Confirm your email</a>
```

The signup action supplies `.RedirectTo` as `<APP_ORIGIN>/auth/confirm`; the
handler hardcodes OTP type `email`. Default templates using `.ConfirmationURL`
do not directly exercise this token-hash route. Keep Preview and Production
configuration separate. No hosted settings or Production deployment were
changed as part of this code repair.

Reference: [Supabase server-side email confirmation](https://supabase.com/docs/guides/auth/server-side/nextjs).

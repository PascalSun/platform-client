# @ntlp/platform-client

How a research app's **frontend** talks to the [NTLP Geo Research Platform](https://geo.nlp-tlp.org): sign-in through the platform, the tokens that come with it, and calling the platform's API as the signed-in person. Every research app on the platform (MineTrace, CoreTrace, …) reaches the platform's data through its public API and nothing else; this package only saves each app from writing the same sign-in and token code again. The API itself is documented at <https://platform.nlp-tlp.org/api/docs/> and works from any language.

No credentials live here. Everything the package needs comes from the app's own environment at build time.

## Install

The package is TypeScript source, consumed by Next.js apps. Depend on a tagged version from GitHub and let Next compile it:

```jsonc
// package.json
"dependencies": { "@ntlp/platform-client": "github:PascalSun/platform-client#v0.1.0" }
```

```ts
// next.config.ts
const nextConfig = { transpilePackages: ["@ntlp/platform-client"] };
```

## Set-up

Environment (all `NEXT_PUBLIC_*`, read at build time):

| Variable | Meaning | Default |
|---|---|---|
| `NEXT_PUBLIC_PLATFORM_URL` | the platform's origin | `https://platform.nlp-tlp.org` |
| `NEXT_PUBLIC_PLATFORM_CLIENT_ID` | this app's OAuth client id on the platform (`<app>-web`) | derived from the host name |
| `NEXT_PUBLIC_PLATFORM_OIDC` | `0` when the platform has no OIDC key (a dev platform) | on |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | where "contact support" points | the platform's |

Optional, once at start-up: `configurePlatformClient({ onEvent })` to receive sign-in events for analytics.

## Sign-in (one sign-in for every app)

The platform is the identity provider. Two pages in the app:

```tsx
// app/auth/signin/page.tsx — send the browser to the platform; it comes back to /auth/callback
"use client";
import { useEffect } from "react";
import { signIn } from "@ntlp/platform-client";
export default function Page() { useEffect(() => { signIn(new URLSearchParams(location.search).get("next") ?? "/"); }, []); return null; }

// app/auth/callback/page.tsx — finish it, then go where the person was
"use client";
import { useEffect } from "react";
import { completeSignIn } from "@ntlp/platform-client";
export default function Page() { useEffect(() => { completeSignIn().then((to) => location.replace(to)); }, []); return null; }
```

Anywhere else: link to `/auth/signin?next=<current path>`. `isAuthed()`, `getAuth()`, `fetchMe()`, `signOut()` do what they say. Tokens refresh themselves.

The app must be registered on the platform (one entry in its research-app registry gives it the OAuth client `<app>-web` with redirect `<app url>/auth/callback`, and a CORS allowance).

## Calling the API

```ts
import { platformFetch } from "@ntlp/platform-client";
const res = await platformFetch("/core-scan/api/holes/");      // bearer token attached, refreshed on expiry
```

## What is in it

| Module | Contents |
|---|---|
| `sso` | `signIn`, `completeSignIn`, `refreshOAuth`, `signOut`, `clientId` (OAuth authorization code + PKCE against the platform) |
| `auth` | the stored session (`getAuth`/`setAuth`/`clearAuth`, `isAuthed`, `isVerified`, `fetchMe`) and the platform's older email/password sign-in calls |
| `fetch` | `PLATFORM_URL`, `platformFetch` |
| `chrome` | the `Chrome` type (brand, nav, footer) the shared navbar and footer take, `appEntry` |
| `config` | `configurePlatformClient` |

## Versions

Tag a release (`git tag v0.1.1 && git push --tags`) and bump the tag in each app's `package.json`. Breaking changes get a new major.

## The sign-in dialog

`@ntlp/platform-client/email-gate` exports `EmailGate`, the in-page sign-in dialog every app on the platform uses (emailed 6-digit code by default, password as the alternative). It needs `motion` and `lucide-react` in the app, and the app's Tailwind must scan this package's `src` (`@source "../../node_modules/@ntlp/platform-client/src";` in `globals.css`). Pass `t` to translate its strings; English is built in.

```tsx
import { EmailGate } from "@ntlp/platform-client/email-gate";
<EmailGate open={open} onClose={() => setOpen(false)} onAuthed={() => { setOpen(false); refetch(); }} />
```

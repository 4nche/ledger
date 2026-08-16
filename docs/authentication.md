# Authentication

Google sign-in via [Better Auth](https://better-auth.com), self-hosted. Sessions
are rows in the same PostgreSQL as everything else, created by the same
migrations, so they can be inspected and revoked with SQL.

---

## The one thing to understand

**Signing in with Google is authentication. `ALLOWED_EMAILS` is authorisation.**

Everyone on earth has a Google account. Proving which one you own says nothing
about whether you may read this journal. The allowlist is the part that keeps
people out, and it is the part to get right.

An empty allowlist denies everyone. The API refuses to start without one,
because the opposite default — a missing variable quietly publishing the
journal — is the worst outcome available.

---

## Setting up Google credentials

1. [Google Cloud Console](https://console.cloud.google.com/) → create or pick a project.
2. **APIs & Services → OAuth consent screen**. Choose **External**, fill in the
   app name and your email. It can stay in _Testing_; add both traders as test
   users. There is nothing to verify — this app is not public.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**.
4. Add **Authorised redirect URIs**. The path is fixed by the app:

   ```
   http://localhost:3000/api/auth/callback/google
   https://your-domain.example/api/auth/callback/google
   ```

   Register both now. Google matches these exactly, and a missing production
   URI only fails at the moment you deploy.

5. Copy the client ID and secret into `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=…
   ALLOWED_EMAILS=you@gmail.com,them@gmail.com
   BETTER_AUTH_SECRET=…
   ```

   Generate the secret with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

`.env` is gitignored. Never commit these.

---

## How a request is authenticated

```
Browser ──cookie──▶ Next ──forwards cookie──▶ Fastify ──▶ auth_session ──▶ users
```

The **API validates every request itself**. It does not trust a header from the
web app. That costs a little setup and buys an API a future mobile app or
exchange importer can call directly, without a second and weaker authentication
path being invented for it.

Next's server components run on the server, so nothing attaches the browser's
cookie for them automatically — `lib/api.ts` forwards it explicitly. Without
that, every server-rendered page would receive a 401.

Two credential forms are accepted:

| Form                            | Used by                                  |
| ------------------------------- | ---------------------------------------- |
| Session cookie                  | browsers                                 |
| `Authorization: Bearer <token>` | non-browser clients, and the test suites |

Only `/health` and `/api/auth/*` are reachable without a session. The auth
routes must be, or nobody could ever begin signing in.

---

## Who is allowed in

`ALLOWED_EMAILS` is checked at two moments:

- **First sign-in**, before a `users` row is created. A stranger who
  authenticates with Google never becomes a user.
- **Every subsequent sign-in**, before a session is created. Removing an address
  from the list therefore locks out an existing trader, not just new ones.

Matching is exact and case-insensitive. There are deliberately no domain
wildcards: a wildcard is indistinguishable from a typo, and the failure mode is
silent public access.

Revoking access to someone already signed in:

```sql
-- Stop them now; also remove them from ALLOWED_EMAILS so they cannot return.
DELETE FROM auth_session WHERE user_id = (SELECT id FROM users WHERE email = 'them@gmail.com');
```

---

## Visibility

Both traders see everything: all accounts, all positions, all totals. That
matches the spec, whose overview filters by trader and whose summaries span
accounts.

Authentication is therefore the only gate — there is no per-row authorisation.
If that ever changes, the place to add it is `filterConditions` in
`apps/api/src/modules/positions/repository.ts`, which every read already passes
through.

---

## Tables

Better Auth's tables are prefixed `auth_`, because its default name for OAuth
provider links is `account` — one letter from `accounts`, the trading accounts
this application is about. Two tables that similar in name and that different in
meaning is a bug waiting to happen.

| Table               | Holds                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| `users`             | traders — the existing table, which `accounts.user_id` already points at |
| `auth_session`      | live sessions, looked up by token on every request                       |
| `auth_account`      | the link between a trader and their Google identity                      |
| `auth_verification` | short-lived OAuth state                                                  |

Deleting a `users` row cascades to their sessions and provider links.

---

## Before deploying

- [ ] `BETTER_AUTH_SECRET` is a fresh 32+ byte value, different from development
- [ ] Production redirect URI registered in Google Cloud Console
- [ ] `WEB_ORIGIN` set to the real HTTPS origin — cookies are marked `secure`
      whenever `NODE_ENV=production`, and a `secure` cookie is never sent over
      plain HTTP, so sign-in silently fails without TLS
- [ ] `ALLOWED_EMAILS` set to the real addresses
- [ ] The API is **not** publicly reachable. It binds `127.0.0.1` by default;
      keep it that way or put it behind the same network boundary as the web app

# Auth recovery verification

Run `bunx vite --config tests/browser/vite.config.ts` and open its URL. This
separate Vite entry uses the real auth provider, Convex SDK, chat composer, and
quick-add form with simulated Clerk and WebSocket services. It never accesses
an account or backend. The app's Vite config does not include these replacements.

1. Type a message and notes. Choose **Hang refresh**, then **Restore service**.
   The recovery screen should appear and the text should return after the bounded
   token request and retry finish.
2. Choose **Switch user**. Drafts should be empty.
3. Choose **Reject tokens**, then **Fail sign out** and **Sign out**. An error
   should remain visible. Choose **Allow sign out**, then **Sign out**. The
   sign-in screen should appear; signing in again should start with empty drafts.
4. Choose **Fail Clerk**. A reload action should replace indefinite loading.
   **Restore Clerk** should restore the current user's session.

`tests/auth-transport.test.tsx` exercises token rotation, hung fetches, queued
writes, account switching, exhausted handshakes, and late tokens with the real
Convex client. `tests/drafts.test.tsx` covers open forms and pending submissions
across recovery remounts. Drafts live only in memory and do not survive a reload.

These checks do not replace verification of real Clerk login, cookie policy,
session expiry, and cross-tab account changes in a signed-in browser.

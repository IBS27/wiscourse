# Auth recovery verification

Run `bunx vite --config tests/browser/vite.config.ts` and open its URL. This
separate Vite entry uses the real auth provider, Convex SDK, chat composer, and
quick-add form with simulated Clerk and WebSocket services. It never accesses
an account or backend. The app's Vite config does not include these replacements.

1. Type a message and notes. Choose **Hang refresh**. The page should stay as it
   is, text included, and a "Reconnecting…" banner should appear after a few
   seconds. Choose **Restore service**: the banner should go away.
2. Choose **Switch user**. Drafts should be empty.
3. Choose **Reject tokens**, then **Fail sign out** and **Sign out**. An error
   should remain visible. Choose **Allow sign out**, then **Sign out**. The
   sign-in screen should appear; signing in again should start with empty drafts.
4. Choose **Fail Clerk**. The page should stay open, and after a few seconds a
   banner should offer a reload. **Restore Clerk** should clear it.
5. Type a message and reload the page. The message should still be there; the
   notes, which are not kept, should be empty.

`tests/auth-transport.test.tsx` exercises token rotation, hung fetches, queued
writes, account switching, exhausted handshakes, and late tokens with the real
Convex client. `tests/drafts.test.tsx` covers open forms and pending submissions
across recovery remounts. Drafts live in memory; only the text drafts a form
asks to keep (the chat message, a text or URL submission) are also held in the
tab's session storage, and survive a reload.

These checks do not replace verification of real Clerk login, cookie policy,
session expiry, and cross-tab account changes in a signed-in browser.

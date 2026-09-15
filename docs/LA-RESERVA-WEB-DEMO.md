# La Reserva website demo

New isolated restaurant theme for the published `la-reserva-demo` record only.
The existing El Pescador theme and all other restaurant routes retain their implementation.
La Reserva tenant: `de000000-0000-4000-8000-000000000002`.

The page uses the existing public restaurant loader, live menu sections, booking widget,
availability endpoint, reservation creation endpoint and private management links.
No database configuration or schema was changed. The shared demo notice now displays
the actual restaurant name instead of always claiming reservations belong to DEMOOOO.

Design: dark charcoal, copper, large serif headlines, restaurant photography, food section,
keyboard-accessible menu categories, responsive booking section and fixed mobile actions.
The menu prices and descriptions come from the restaurant panel. Demo labels avoid
presenting this fictitious restaurant as a real business. No invented reviews or awards.

Validation on 2026-09-15:
- ESLint passed on the four changed TSX files.
- TypeScript passed.
- Next.js production build passed for the entire application using CI public placeholders.
- Public La Reserva availability returned HTTP 200 and nine slots for 2026-09-16, party 2.
- The existing public booking database function returned a confirmed synthetic reservation.
  It ran inside a transaction followed by ROLLBACK, with review messaging disabled.
- git diff --check passed.

Remaining before handoff:
- Browser visual QA, mobile interaction QA and final live-page verification.
  The local browser preview was unavailable. No visual success is claimed.
- Push feature branch, open PR, check CI, merge and verify deployment.
  The initial push was rejected by automatic approval review because explicit authorization
  to publish repository content was required. The user explicitly authorized the GitHub
  upload and publication on 2026-09-15.

Local-only preview fixture lives in ignored `.reserva-preview/`; it is not shipped.
Do not deploy that fixture: production reads the restaurant and menu directly.
Expected existing route after publication: `/restaurante/la-reserva-demo`.

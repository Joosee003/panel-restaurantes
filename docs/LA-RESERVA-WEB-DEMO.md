# La Reserva website demo

Distinct restaurant theme for the published `la-reserva-demo` only. Existing El Pescador and all other restaurant themes remain unchanged.

Uses the public restaurant loader, live menu categories and prices, existing availability and booking endpoints, and private reservation management links. No database schema or configuration changes.

The shared demo notice displays the actual restaurant name. Marketing headings and form colors are isolated from panel theme styles. Responsive photography does not overflow the narrow layout. Menu categories support pointer and keyboard navigation.

Verified on 2026-09-15:
- Next.js production build, TypeScript and ESLint passed.
- GitHub Panel quality passed on e5931d66fbf5e1212cefeeece4efb264642db659.
- All three photos loaded; desktop menu categories showed live panel prices.
- Mobile navigation and menu verified at 390px. Document scroll width 375px, with no horizontal page overflow.
- Created one synthetic reservation through the mobile website. Database confirmed it belonged to La Reserva tenant de000000-0000-4000-8000-000000000002.
- Changed that reservation from 13:00 to 13:30 through its private management link, then cancelled it. Database confirmed cancellation. Optional WhatsApp review consent was not selected.
- Earlier database-function rehearsal ran inside a rolled-back transaction.
- Fixed three pre-existing test helper variable names rejected by Next.js ESLint; their 20 tests passed without assertion changes.

The temporary mobile QA wrapper is removed before production. User explicitly authorized GitHub upload and publication on 2026-09-15.

Public route: `/restaurante/la-reserva-demo`.

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

## Modern redesign — 15 September 2026

- New red, ivory and charcoal identity, responsive editorial typography, fixed section navigation and native booking drawer reachable from the header, hero, menu details and mobile action bar.
- Live menu categories now use image cards and accessible native detail dialogs. Keyboard arrows, Home and End change tabs. The gallery supports navigation, enlargement, Escape and focus restoration.
- Entrance motion uses IntersectionObserver; reduced-motion preferences disable transitions and smooth scrolling. Content is visible without observer execution.
- Original illustrative food atlas and restaurant interior were created with the built-in image tool. Final optimized assets are `public/la-reserva/carta-demo.webp` (368,652 bytes) and `public/la-reserva/ambiente-demo.webp` (290,444 bytes). The atlas is rendered through CSS, with no per-dish duplicate downloads. Demo imagery is identified in the page copy. New custom image uploads retain priority over seeded illustrations.
- Image briefs: eight matching Mediterranean menu items in a regular 4×2 photo atlas (tataki, croquettes, seafood rice, entrecote, truffle pasta, cheesecake, water, red wine); a warm contemporary Mediterranean dining room with red upholstery and arched terrace openings.
- TypeScript and component ESLint passed. Vercel preview and GitHub quality workflow passed for b94677d. Browser verification covered desktop, 390px and 360px layouts, menu detail-to-booking navigation, keyboard tab selection, gallery enlargement and Escape focus restoration, mobile menu and availability for the correct restaurant.
- One synthetic booking was submitted through the new mobile drawer for 3 people. SQL confirmed the expected La Reserva demo tenant and fictional contact data. No review messaging consent was selected.
- No changes to shared booking logic, restaurant configuration, database schema, authentication or other restaurant themes.
- The responsive browser wrapper is built only on this feature branch’s preview and removed by the production build. It is not part of the public production site.

- The synthetic mobile booking was cancelled via its private management page; SQL verified `estado=cancelada` for the same demo record. A narrow-screen headline adjustment prevents the last letter from clipping at 360px.


## Septiembre 2026 — firma GastroHelp
La dirección visual vigente y los criterios reutilizables se documentan en `GASTROHELP-DESIGN-SIGNATURE.md`. Sustituye la paleta roja y el titular de tres líneas por una entrada fotográfica, azul tinta y la firma «Tu sitio en la mesa». La carta se presenta como lista interactiva con fotografía protagonista.

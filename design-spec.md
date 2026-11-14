# Home design spec · CarePoint × edgegroup.ae

Reference captured 14 Nov 2026 from `https://edgegroup.ae/` at 1440 and 390 widths. This is a design-language study only; no reference copy, logo, media, or code is reused.

## 1. Tokens
- `--edge-orange: #ff5622`; hover `#e94a1c`
- `--edge-charcoal: #434b51`; body text `#212529`; muted `#6c757d`
- `--edge-gray: #efefef`; smoke `#f7f7f7`; white `#fff`; line `#dddddc`
- `--edge-container: 1320px`; desktop gutter 24px (60px margin at 1440)
- Radius `0`; shadows `none`; borders `1px solid #ddd`
- Font: Archivo (open-license Gibson substitute), weights 400/500/600, self-hosted
- Body `16px/24px`; nav `16px/24px`; buttons `16px`; section number `13.6px/20.4`
- Section titles `44px/71px`, uppercase, weight 600, tracking `0.1em`
- Hero title `40px/52px`, weight 600, tracking `0.08em`; CTA title `53px/85px`
- Buttons: 60px tall desktop, 0 padding 30px; header CTA 40px tall, padding 8px 20px
- Transition `0.3s ease-in-out`; reveal easing `cubic-bezier(0.19,1,0.22,1)`

## 2. Layout / hierarchy
- Fixed white header, 75px, charcoal text, orange square CTA, thin 1px rules; mobile boxed search/lang/menu controls.
- Hero: 100vh, light smoke field, short uppercase title left, outlined arrow button + orange circular play control; large clinical media right; side arrows, slide counter.
- 01/ Intro: smoke background, 96px bottom pad; left section number, oversized uppercase title; full-bleed image right; body copy and orange button in lower half.
- 02/ Solutions: `#efefef`, 96px vertical pad; number left, title, underlined “All services” link; 3-column white card grid (6 cards), sharp corners, 24px gap, uppercase headings, orange 32×8 bar, line-art visual, arrow.
- 03/ Notes: white, 96px pad; 4-column editorial cards; image, orange category/date, 24px heading, muted excerpt.
- 04/ CTA: smoke field with translucent charcoal wash, 160px pad; centered uppercase title, short copy, orange button; clinical image right, orange up-arrow block at lower right.
- Footer: charcoal `#434b51`, 96px top pad; 4 columns; 16px links; lighter charcoal bar with logo, legal links, social boxes; centered copyright.

## 3. Medical adaptation
- Keep CarePoint information architecture: Clinics, Services, How it works, Contact, Book, Log in, My portal.
- Replace sectors with clinic specialties; replace defence media with existing clinic photography and original cross/ECG/line-art SVGs.
- Copy must be original and generic. No invented clinical outcomes, ratings, phone numbers, or statistics; stats use live directory counts only.
- Preserve all functional IDs/classes, form actions, API calls, and auth/booking logic.

## 4. Motion
- On-load hero copy rise + media reveal; header remains fixed.
- Scroll: block reveal with orange line sweep for titles; 16px rise/fade for copy and cards; stagger 55–90ms.
- Cards: charcoal text → orange fill on hover, line-art fades, arrow moves right.
- Buttons/links: fill/underline sweep, arrow translate; media slow scale on hover.
- Respect `prefers-reduced-motion: reduce`: no transforms, parallax, autoplay, reveals, or smooth scrolling.

## 5. Responsive
- ≤1100: 2-column cards; intro image stays full-bleed right.
- ≤860: single-column cards, stacked hero, fixed header 64px, mobile menu, CTA stacks, footer 2/1 columns.
- ≤560: 16px gutters, 32px hero/section titles, 44px buttons, hide decorative card art, 1-column notes/footer.

Reference evidence: `/tmp/opencode/edge-ref/` (`desktop-full.png`, `mobile-full.png`, `section-*.png`, `styles.json`, `structure.json`).

# Oguz Kartal — Personal Portfolio (Design Spec)

**Date:** 2026-06-04
**Status:** Approved (pending user review of this written spec)
**Style source:** `david_DESIGN.md` (David Kirschberg — Minimalist Dark Canvas)

---

## 1. Goal

Build a single-page personal portfolio for **Oguz Kartal** that follows the
David Kirschberg "Minimalist Dark Canvas" style with **no visual deviations
from the reference tokens**. The site must read as a high-contrast, command-line-inspired
dark canvas where typography, whitespace, and background tone shifts do all the work.
**No accent colors. No drop shadows. No gradients. No glow.**

The site will be built as a static `index.html` + `styles.css` + `script.js`
triple — no build step, no dependencies, trivially deployable to any static host.

---

## 2. Tech Stack

- **HTML5** — single `index.html`
- **CSS3** — single `styles.css`, all design tokens exposed as CSS custom properties
- **Vanilla JS** — single `script.js` for nav toggle (mobile menu) and active-section highlight on scroll
- **No framework, no build, no package.json**
- **No external font files** — `Inter` (body) and `Arial` (twkLausanne substitute) are system-available

### Out of Scope (deliberately)

- No CMS, no MDX, no JSON-driven project list (project data is hardcoded in `index.html` for now)
- No analytics, no tracking pixels
- No image optimization pipeline
- No light/dark theme toggle (the style is dark-only by design)
- No service worker, no PWA, no offline mode
- No i18n (English only)

---

## 3. File Structure

```
.
├── index.html
├── styles.css
├── script.js
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-06-04-portfolio-design.md   (this file)
```

Three files at the project root. No folders, no build output.

---

## 4. Page Structure (Section Order)

```
┌─────────────────────────────────────────────┐
│  Nav (sticky)                               │
├─────────────────────────────────────────────┤
│  HERO         — Name + tagline + location   │
├─────────────────────────────────────────────┤
│  WORK         — 3 project cards (grid)      │
├─────────────────────────────────────────────┤
│  ABOUT        — 2-3 sentence bio            │
├─────────────────────────────────────────────┤
│  CONTACT      — Email + social links        │
└─────────────────────────────────────────────┘
```

Section gap: `45px` (per design tokens).

---

## 5. Design Tokens (CSS Custom Properties)

All tokens are declared once in `:root` in `styles.css` and used throughout.
The values are **copied verbatim from `david_DESIGN.md`** — no rounding, no
re-interpretation, no "improvements".

```css
:root {
  /* Colors */
  --color-midnight-core:  #181818;
  --color-frost-white:    #fafafa;
  --color-slate-surface:  #262626;
  --color-ash-muted:      #a3a3a3;
  --color-ghost-border:   #ffffff14;

  /* Typography — Font Families */
  --font-inter:       'Inter', ui-sans-serif, system-ui, -apple-system,
                      BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-twklausanne: 'twkLausanne', ui-sans-serif, system-ui, -apple-system,
                      BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-base:   16px;  --leading-base:   1.50;
  --text-lg:     17px;  --leading-lg:     1.18;
  --text-3xl:    32px;  --leading-3xl:    1.10;

  /* Spacing */
  --spacing-4:   4px;
  --spacing-8:   8px;
  --spacing-12:  12px;
  --spacing-16:  16px;
  --spacing-24:  24px;

  /* Layout */
  --section-gap:   45px;
  --card-padding:  16px;
  --element-gap:   8px;

  /* Border Radius */
  --radius-default: 16px;
  --radius-surfaces: 24px;
}
```

### Font Substitute Note

`twkLausanne` is a commercial font by Dinamo Font Foundry. Per `david_DESIGN.md`,
the substitute is `Arial`. The CSS variable `--font-twklausanne` will fall back
through `ui-sans-serif, system-ui, -apple-system, ...` and resolve to **Arial**
on the user's machine (Arial is universally available). If the user later
licenses `twkLausanne`, only the font-family declaration needs to change —
every consumer references the variable.

---

## 6. Typography Roles (Resolved)

| Role | Font Variable | Size | Weight | Letter-Spacing | Color |
|------|---------------|------|--------|----------------|-------|
| Hero name (`Oguz Kartal`) | `--font-twklausanne` | 32px | 400 | -0.0400em | `--color-frost-white` |
| Section heading (`Selected Work`, `About`, `Get in touch`) | `--font-twklausanne` | 32px | 400 | -0.0400em | `--color-frost-white` |
| Hero tagline (line 1) | `--font-inter` | 17px | 400 | -0.0090em | `--color-frost-white` |
| Hero location | `--font-inter` | 16px | 400 | -0.0090em | `--color-ash-muted` |
| Project card title | `--font-inter` | 16px | 400 | -0.0090em | `--color-frost-white` |
| Project card description | `--font-inter` | 16px | 400 | -0.0090em | `--color-ash-muted` |
| Project card index (`01`) | `--font-inter` | 16px | 400 | -0.0090em | `--color-ash-muted` |
| About body | `--font-inter` | 16px | 400 | -0.0090em | `--color-frost-white` |
| Nav brand (`Oguz Kartal`) | `--font-inter` | 16px | 400 | -0.0090em | `--color-frost-white` |
| Nav links | `--font-inter` | 16px | 400 | -0.0090em | `--color-frost-white` |
| Ghost button text | `--font-inter` | 16px | 400 | -0.0090em | `--color-frost-white` |

**No font-weight above 400 anywhere. No italic. No underline except for `text-decoration: none` resets.**

---

## 7. Components

### 7.1 Nav (Sticky Header)

- `position: sticky; top: 0; z-index: 100`
- Height: ~56px (16px top + 16px bottom padding)
- Background: `rgba(24, 24, 24, 0.85)` with `backdrop-filter: blur(8px)` for a subtle glass effect that keeps content visible underneath
- Border-bottom: `1px solid var(--color-ghost-border)` (very subtle separator)
- Layout: flexbox, `space-between`
- Left: ghost button "Oguz Kartal" (links to `#hero` / top of page)
- Right: ghost button links — "Work", "About", "Contact" (anchor to `#work`, `#about`, `#contact`)
- Mobile (< 640px): right-side links collapse into a hamburger button; on click, a small dropdown panel appears with the three links stacked vertically

### 7.2 Ghost Button

```css
.ghost-button {
  background: transparent;
  color: var(--color-frost-white);
  border: 1px solid var(--color-frost-white);
  padding: 4px;
  border-radius: 0;
  font-family: var(--font-inter);
  font-size: var(--text-base);
  font-weight: 400;
  letter-spacing: -0.0090em;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  transition: opacity 150ms ease;
}

.ghost-button:hover {
  opacity: 0.7;
}
```

> The `0px radius` and `4px padding` are **exact** from the design doc.
> Hover state is opacity-based (not color-shift) to preserve the no-accent rule.

### 7.3 Project Card

```css
.project-card {
  background: var(--color-slate-surface);   /* #262626 — elevation */
  border-radius: var(--radius-surfaces);    /* 24px */
  padding: var(--card-padding);             /* 16px */
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
  min-height: 140px;
  position: relative;
}

.project-card__index {
  font: 400 16px/1.5 var(--font-inter);
  color: var(--color-ash-muted);
  letter-spacing: -0.0090em;
}

.project-card__title {
  font: 400 16px/1.18 var(--font-inter);
  color: var(--color-frost-white);
  letter-spacing: -0.0090em;
}

.project-card__description {
  font: 400 16px/1.5 var(--font-inter);
  color: var(--color-ash-muted);
  letter-spacing: -0.0090em;
}

.project-card__cta {
  /* ghost button instance at bottom-right of card */
  align-self: flex-end;
  margin-top: auto;
}
```

- **No image** in the card (per scope; abstract illustrations are deferred)
- Index number `01/02/03` reinforces the command-line aesthetic

### 7.4 Section Container

```css
.section {
  max-width: 980px;
  margin: 0 auto;
  padding: 0 24px;
  margin-bottom: var(--section-gap);   /* 45px */
}
```

The narrow 980px container preserves the minimalist "command-line width" feel.

---

## 8. Content (English, Hardcoded)

### 8.1 Hero

- Name: `Oguz Kartal`
- Tagline (line 1, 17px): `I build fast, minimal software.`
- Location (16px, ash-muted): `Based in Istanbul, working globally.`

### 8.2 Selected Work — 3 Placeholder Projects

These are intentionally generic placeholders the user will replace. Each card
has `01/02/03` index, title, description, and a `→ View` ghost button
(links to `#` until real URLs are added).

1. **Project Alpha** — A real-time analytics dashboard for tracking engagement metrics.
2. **Project Beta** — An open-source CLI tool for automating deployment workflows.
3. **Project Gamma** — A minimalist note-taking app focused on speed and keyboard navigation.

> The user explicitly chose "example placeholders" — this content is meant to be
> replaced in `index.html` once real projects exist.

### 8.3 About

Two short sentences:
> I design and build software products with a focus on performance, clarity, and craft. Currently exploring developer tools and creative coding.

### 8.4 Get in Touch

- Primary: ghost button `hello@oguzkartal.dev →` (mailto link)
- Secondary: ghost buttons `GitHub` and `LinkedIn` (placeholder hrefs `https://github.com/` and `https://linkedin.com/`)
- The user can swap the email and the social URLs by editing `index.html`

---

## 9. Layout & Responsive Behavior

### 9.1 Breakpoints

```css
/* Mobile-first base styles apply to < 640px */
@media (min-width: 640px)  { /* tablet */ }
@media (min-width: 1024px) { /* desktop */ }
```

### 9.2 Behavior Per Breakpoint

| Element | Mobile (<640) | Tablet (640-1024) | Desktop (>1024) |
|---------|---------------|-------------------|-----------------|
| Nav right links | Hidden behind hamburger | Visible | Visible |
| Container max-width | 100% - 48px | 100% - 48px | 980px |
| Project grid | 1 column | 1 column | 2 columns |
| Section padding | 16px sides | 24px sides | 24px sides (centered) |
| Hero top margin | 25vh | 30vh | 40vh |

### 9.3 Project Grid

```css
.work__grid {
  display: grid;
  gap: var(--element-gap);   /* 8px */
  grid-template-columns: 1fr;
}

@media (min-width: 1024px) {
  .work__grid {
    grid-template-columns: 1fr 1fr;
  }
}
```

Three projects in a 2-column grid: two on the top row, one alone on the bottom.
This is acceptable per the spec; the user can add a 4th project to balance the
grid later.

---

## 10. Interactions (Vanilla JS, ~30 lines total)

1. **Mobile menu toggle** — click hamburger → toggle a `.nav__menu--open` class
2. **Smooth scroll on anchor click** — `html { scroll-behavior: smooth }` (CSS only, no JS needed)
3. **Active section highlight** — IntersectionObserver adds `.is-active` to nav
   links whose target section is currently in view
4. **Close mobile menu on link click** — clicking a nav link inside the open
   menu closes it

No animations, no transitions beyond the 150ms opacity hover state on ghost
buttons.

---

## 11. Accessibility (Minimum Bar)

- All interactive elements are real `<a>` or `<button>` (no div-buttons)
- Sufficient color contrast (frost-white #fafafa on #181818 = 17.6:1, well above WCAG AAA)
- `aria-label` on the hamburger button: `"Toggle navigation"`
- Hamburger icon uses an inline SVG, not an emoji or icon font
- Focus styles: `outline: 1px solid var(--color-frost-white); outline-offset: 2px`
- Semantic HTML5: `<header>`, `<main>`, `<section>`, `<footer>`
- `<html lang="en">`

---

## 12. Validation Plan (Done Criteria)

The site is "ready" when **all** of the following are true:

- [ ] `index.html` is valid HTML5 (no console errors, passes W3C validator)
- [ ] `styles.css` declares **all** tokens from `david_DESIGN.md` in `:root`
- [ ] No token value is altered (e.g., `#181818` is exactly `#181818`, not `#181819`)
- [ ] No accent colors appear anywhere (grep for `purple`, `blue`, `green`, `red` in CSS — should be empty)
- [ ] No `box-shadow`, no `gradient`, no `filter: blur()` (except the one allowed `backdrop-filter` on nav)
- [ ] `index.html` opens in a browser and renders: nav, hero, 3 project cards, about, contact
- [ ] Hero displays "Oguz Kartal" at the top
- [ ] Section gap is 45px in computed styles
- [ ] Project card radius is 24px in computed styles
- [ ] Mobile (< 640px): hamburger menu toggles open/close
- [ ] Desktop (> 1024px): project grid is 2 columns
- [ ] All anchor links scroll to their target sections
- [ ] Tab navigation reaches all interactive elements in logical order
- [ ] No external network requests (no CDN, no Google Fonts, no analytics)
- [ ] File sizes: `index.html` < 10KB, `styles.css` < 8KB, `script.js` < 2KB

### Test Method

```bash
# Open in browser
xdg-open index.html        # Linux
# or just double-click index.html

# Mobile check
# Resize browser to 375px wide → verify hamburger appears

# Lighthouse / DevTools check
# Run Lighthouse in Chrome DevTools → target Performance 100, Accessibility 100
```

---

## 13. Risks and Limitations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `twkLausanne` is a paid font; the substitute `Arial` has wider letter-spacing defaults, so the `-0.0400em` heading letter-spacing may not look identical | LOW | Acceptable; user can license the real font and swap in one line. Spec is faithful to the doc. |
| The user has no real projects yet, so the 3 cards are placeholders | LOW | Marked clearly in `index.html` with HTML comments; user replaces easily. |
| Single-page anchor scrolling is janky in older Safari | LOW | Add `scroll-behavior: smooth` only when `(prefers-reduced-motion: no-preference)` |
| No light theme — some visitors may not like dark | NONE (by design) | The style doc is dark-only; this is a deliberate constraint. |

---

## 14. Out of Scope (Future Iterations)

These are explicitly **not** part of this spec — they would each be a separate
brainstorming/planning cycle:

- Blog / writing section
- Project case study pages (currently each project is a single card)
- Light mode toggle
- Real `twkLausanne` font integration
- Image/illustration in project cards
- Real project data driven from a JSON/MDX file
- Internationalization (Turkish / English toggle)
- Analytics integration
- SEO meta tags beyond the basic `<title>` and `<meta description>`
- Custom domain / hosting setup

---

## 15. Quick Start for the User (After Build)

```bash
# 1. Edit your projects — open index.html, find the .work__grid section
#    and replace the three placeholder cards with your real ones.

# 2. Edit your contact info — find hello@oguzkartal.dev, GitHub, LinkedIn
#    in the .contact section.

# 3. Deploy — push the three files to:
#    - GitHub Pages
#    - Netlify (drag-and-drop the folder)
#    - Vercel (vercel deploy)
#    - Cloudflare Pages
#    Any static host works. There is no build step.
```

---

**End of spec.**

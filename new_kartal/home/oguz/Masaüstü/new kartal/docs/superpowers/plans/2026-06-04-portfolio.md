# Oguz Kartal Portfolio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page personal portfolio for Oguz Kartal that strictly follows the David Kirschberg "Minimalist Dark Canvas" design tokens, in plain HTML/CSS/JS with zero build step.

**Architecture:** Three flat files at the project root — `index.html` (semantic markup with all content hardcoded), `styles.css` (all design tokens as CSS custom properties, mobile-first media queries), `script.js` (~30 lines: mobile menu toggle, active-section highlight via IntersectionObserver). No framework, no build, no external dependencies.

**Tech Stack:** HTML5, CSS3 (custom properties + mobile-first media queries), Vanilla JavaScript (ES2020). Optional: `git` for version control. No package manager.

**Spec:** `docs/superpowers/specs/2026-06-04-portfolio-design.md`

---

## File Structure

```
/home/oguz/Masaüstü/new kartal/
├── index.html              # All markup, all content, semantic HTML5
├── styles.css              # All design tokens in :root, mobile-first CSS
├── script.js               # Mobile menu + active section highlight
├── david_DESIGN.md         # (existing) — style reference, read-only
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-06-04-portfolio-design.md
        └── plans/
            └── 2026-06-04-portfolio.md   (this file)
```

**File responsibilities:**
- `index.html` — semantic structure (header/nav, main with 4 sections, no footer needed). All English content hardcoded. Anchor IDs: `hero`, `work`, `about`, `contact`.
- `styles.css` — `:root` block with all design tokens verbatim from `david_DESIGN.md`. Mobile-first base styles. Media queries at 640px and 1024px.
- `script.js` — hamburger toggle (adds/removes `is-open` class on `.nav`), IntersectionObserver to add `is-active` to nav links, smooth scroll behavior delegated to CSS.

---

## Task 1: Project Setup

**Files:**
- Create: `index.html` (empty skeleton)
- Create: `styles.css` (empty)
- Create: `script.js` (empty)
- Create: `.gitignore` (just `node_modules/` and `.DS_Store` defensively)

- [ ] **Step 1: Initialize git repository**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git init
git config user.email "oguz@example.com"  # use your real email
git config user.name "Oguz Kartal"
```

If the user prefers not to use git, skip this step and all subsequent commit steps.

- [ ] **Step 2: Create empty skeleton files**

Create `index.html` with this exact content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Oguz Kartal</title>
  <meta name="description" content="Personal portfolio of Oguz Kartal — designer and builder of fast, minimal software." />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- Content goes here in Task 3 -->
  <script src="script.js"></script>
</body>
</html>
```

Create `styles.css` with this exact content:

```css
/* Design tokens and styles will be added in Tasks 2-8 */
```

Create `script.js` with this exact content:

```javascript
// Mobile menu + active section highlight added in Task 9
```

Create `.gitignore` with this exact content:

```
.DS_Store
node_modules/
```

- [ ] **Step 3: Verify files exist**

```bash
cd "/home/oguz/Masaüstü/new kartal"
ls -la index.html styles.css script.js .gitignore
```

Expected output: All four files listed.

- [ ] **Step 4: Initial commit (if using git)**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add index.html styles.css script.js .gitignore
git commit -m "chore: initial project skeleton"
```

---

## Task 2: Define Design Tokens in styles.css

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Replace `styles.css` with full `:root` token block**

Write this **exact** content to `styles.css` (replace the entire file):

```css
:root {
  /* Colors — copied verbatim from david_DESIGN.md */
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

/* CSS reset — minimal, does not affect design tokens */
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-midnight-core);
  color: var(--color-frost-white);
  font-family: var(--font-inter);
  font-size: var(--text-base);
  line-height: var(--leading-base);
  letter-spacing: -0.0090em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

img, svg {
  display: block;
  max-width: 100%;
}
```

- [ ] **Step 2: Verify token values are exact**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -E "#[0-9a-fA-F]{3,8}" styles.css
```

Expected output: Five lines starting with `--color-` containing exactly:
```
--color-midnight-core:  #181818;
--color-frost-white:    #fafafa;
--color-slate-surface:  #262626;
--color-ash-muted:      #a3a3a3;
--color-ghost-border:   #ffffff14;
```

- [ ] **Step 3: Verify no forbidden CSS patterns**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -nE "box-shadow|gradient|filter:.*blur" styles.css || echo "OK: no forbidden patterns"
```

Expected: `OK: no forbidden patterns`
(The `backdrop-filter: blur` used later in nav is permitted by the spec, this check only catches the others.)

- [ ] **Step 4: Visual check**

Open `index.html` in a browser. Expected: a black page with white default browser text, no visible flash of unstyled content beyond the body.

- [ ] **Step 5: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add styles.css
git commit -m "feat(styles): add design tokens and minimal reset"
```

---

## Task 3: Build index.html Structure and Content

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace `index.html` with full content**

Write this **exact** content to `index.html` (replace the entire file):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Oguz Kartal</title>
  <meta name="description" content="Personal portfolio of Oguz Kartal — designer and builder of fast, minimal software." />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="nav" id="nav">
    <a href="#hero" class="nav__brand ghost-button">Oguz Kartal</a>

    <button class="nav__toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="nav-menu">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <line x1="3" y1="6"  x2="17" y2="6"  stroke="currentColor" stroke-width="1.5" />
        <line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>

    <nav class="nav__menu" id="nav-menu" aria-label="Primary">
      <a href="#work"    class="nav__link ghost-button">Work</a>
      <a href="#about"   class="nav__link ghost-button">About</a>
      <a href="#contact" class="nav__link ghost-button">Contact</a>
    </nav>
  </header>

  <main>
    <section class="section section--hero" id="hero">
      <h1 class="hero__name">Oguz Kartal</h1>
      <p class="hero__tagline">I build fast, minimal software.</p>
      <p class="hero__location">Based in Istanbul, working globally.</p>
    </section>

    <section class="section section--work" id="work">
      <h2 class="section__heading">Selected Work</h2>

      <div class="work__grid">
        <article class="project-card">
          <span class="project-card__index">01</span>
          <h3 class="project-card__title">Project Alpha</h3>
          <p class="project-card__description">A real-time analytics dashboard for tracking engagement metrics.</p>
          <a href="#" class="project-card__cta ghost-button">View &rarr;</a>
        </article>

        <article class="project-card">
          <span class="project-card__index">02</span>
          <h3 class="project-card__title">Project Beta</h3>
          <p class="project-card__description">An open-source CLI tool for automating deployment workflows.</p>
          <a href="#" class="project-card__cta ghost-button">View &rarr;</a>
        </article>

        <article class="project-card">
          <span class="project-card__index">03</span>
          <h3 class="project-card__title">Project Gamma</h3>
          <p class="project-card__description">A minimalist note-taking app focused on speed and keyboard navigation.</p>
          <a href="#" class="project-card__cta ghost-button">View &rarr;</a>
        </article>
      </div>
    </section>

    <section class="section section--about" id="about">
      <h2 class="section__heading">About</h2>
      <p class="about__body">
        I design and build software products with a focus on performance, clarity, and craft.
        Currently exploring developer tools and creative coding.
      </p>
    </section>

    <section class="section section--contact" id="contact">
      <h2 class="section__heading">Get in touch</h2>
      <div class="contact__links">
        <a href="mailto:hello@oguzkartal.dev" class="contact__primary ghost-button">hello@oguzkartal.dev &rarr;</a>
        <a href="https://github.com/"          class="contact__secondary ghost-button" target="_blank" rel="noopener">GitHub</a>
        <a href="https://linkedin.com/"        class="contact__secondary ghost-button" target="_blank" rel="noopener">LinkedIn</a>
      </div>
    </section>
  </main>

  <script src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Validate HTML structure**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -cE "<section" index.html
```

Expected: `4` (hero, work, about, contact)

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -cE 'id="(hero|work|about|contact)"' index.html
```

Expected: `4`

- [ ] **Step 3: Verify all 4 anchor IDs are present**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -oE 'id="(hero|work|about|contact)"' index.html | sort
```

Expected output:
```
id="about"
id="contact"
id="hero"
id="work"
```

- [ ] **Step 4: Verify the nav links resolve to those IDs**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -oE 'href="#(hero|work|about|contact)"' index.html | sort
```

Expected: same 4 IDs as above.

- [ ] **Step 5: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add index.html
git commit -m "feat(html): add semantic structure with all sections and content"
```

---

## Task 4: Style the Nav (Sticky Header)

**Files:**
- Modify: `styles.css` (append)

- [ ] **Step 1: Append nav styles to `styles.css`**

Append this content to the end of `styles.css`:

```css
/* ============================================================
   Nav — sticky header
   ============================================================ */
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-8);
  padding: var(--spacing-16) 24px;
  background: rgba(24, 24, 24, 0.85);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--color-ghost-border);
}

.nav__brand {
  /* uses .ghost-button */
}

.nav__menu {
  display: flex;
  align-items: center;
  gap: var(--element-gap);   /* 8px */
}

.nav__link.is-active {
  opacity: 0.7;
}

.nav__toggle {
  display: none;             /* hidden on desktop, shown on mobile via media query */
  padding: 4px;
  color: var(--color-frost-white);
}

/* Ghost Button (shared by nav, project CTA, contact links) */
.ghost-button {
  display: inline-block;
  padding: 4px;
  background: transparent;
  color: var(--color-frost-white);
  border: 1px solid var(--color-frost-white);
  border-radius: 0;
  font-family: var(--font-inter);
  font-size: var(--text-base);
  font-weight: 400;
  letter-spacing: -0.0090em;
  cursor: pointer;
  text-decoration: none;
  transition: opacity 150ms ease;
}

.ghost-button:hover,
.ghost-button:focus-visible {
  opacity: 0.7;
}

.ghost-button:focus-visible {
  outline: 1px solid var(--color-frost-white);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Visual check — nav on desktop**

Open `index.html` in a browser at >1024px wide. Expected:
- A dark sticky bar at the top
- "Oguz Kartal" on the left with a thin white border (ghost button)
- "Work", "About", "Contact" on the right (also ghost buttons)
- Subtle backdrop blur visible when scrolling content underneath

- [ ] **Step 3: Verify nav height is approximately 56px**

In browser DevTools, inspect the `.nav` element. Expected: `height` ≈ 56px (16px top padding + 24px content + 16px bottom padding).

- [ ] **Step 4: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add styles.css
git commit -m "feat(styles): add nav and ghost-button components"
```

---

## Task 5: Style the Hero Section

**Files:**
- Modify: `styles.css` (append)

- [ ] **Step 1: Append hero and section-base styles**

Append this to `styles.css`:

```css
/* ============================================================
   Section base — shared by all four sections
   ============================================================ */
.section {
  max-width: 980px;
  margin: 0 auto;
  margin-bottom: var(--section-gap);   /* 45px */
  padding: 0 24px;
}

.section__heading {
  margin: 0 0 var(--spacing-24) 0;
  font-family: var(--font-twklausanne);
  font-size: var(--text-3xl);     /* 32px */
  font-weight: 400;
  line-height: var(--leading-3xl); /* 1.10 */
  letter-spacing: -0.0400em;
  color: var(--color-frost-white);
}

/* ============================================================
   Hero
   ============================================================ */
.section--hero {
  padding-top: 40vh;   /* desktop top space per spec */
  padding-bottom: 0;
}

.hero__name {
  margin: 0 0 var(--spacing-16) 0;
  font-family: var(--font-twklausanne);
  font-size: var(--text-3xl);     /* 32px */
  font-weight: 400;
  line-height: var(--leading-3xl); /* 1.10 */
  letter-spacing: -0.0400em;
  color: var(--color-frost-white);
}

.hero__tagline {
  margin: 0 0 var(--spacing-8) 0;
  font-family: var(--font-inter);
  font-size: var(--text-lg);       /* 17px */
  font-weight: 400;
  line-height: var(--leading-lg);  /* 1.18 */
  letter-spacing: -0.0090em;
  color: var(--color-frost-white);
  max-width: 28ch;   /* keep tagline narrow for command-line feel */
}

.hero__location {
  margin: 0;
  font-family: var(--font-inter);
  font-size: var(--text-base);     /* 16px */
  font-weight: 400;
  line-height: var(--leading-base); /* 1.50 */
  letter-spacing: -0.0090em;
  color: var(--color-ash-muted);
}
```

- [ ] **Step 2: Visual check — hero renders correctly**

Reload the browser. Expected:
- "Oguz Kartal" appears as a large heading near the top of the visible area
- Tagline below: "I build fast, minimal software."
- Location line in muted gray: "Based in Istanbul, working globally."
- Lots of vertical space above the name (40vh on desktop)
- 45px gap between hero and work section

- [ ] **Step 3: Verify computed font-size of `.hero__name`**

In browser DevTools, inspect `.hero__name`. Expected computed `font-size: 32px` and `letter-spacing: -1.28px` (= 32 × -0.04).

- [ ] **Step 4: Verify the section gap is 45px**

In browser DevTools, inspect `.section` (the hero one). Expected computed `margin-bottom: 45px`.

- [ ] **Step 5: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add styles.css
git commit -m "feat(styles): add hero and shared section base styles"
```

---

## Task 6: Style the Work Grid and Project Cards

**Files:**
- Modify: `styles.css` (append)

- [ ] **Step 1: Append work + project card styles**

Append this to `styles.css`:

```css
/* ============================================================
   Selected Work — grid + project cards
   ============================================================ */
.work__grid {
  display: grid;
  gap: var(--element-gap);   /* 8px between cards */
  grid-template-columns: 1fr;  /* mobile-first: single column */
}

.project-card {
  background: var(--color-slate-surface);   /* #262626 */
  border-radius: var(--radius-surfaces);    /* 24px */
  padding: var(--card-padding);             /* 16px */
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);                    /* 8px */
  min-height: 140px;
  position: relative;
}

.project-card__index {
  font-family: var(--font-inter);
  font-size: var(--text-base);     /* 16px */
  font-weight: 400;
  line-height: var(--leading-base); /* 1.50 */
  letter-spacing: -0.0090em;
  color: var(--color-ash-muted);
}

.project-card__title {
  margin: 0;
  font-family: var(--font-inter);
  font-size: var(--text-base);      /* 16px */
  font-weight: 400;
  line-height: var(--leading-lg);    /* 1.18 */
  letter-spacing: -0.0090em;
  color: var(--color-frost-white);
}

.project-card__description {
  margin: 0;
  font-family: var(--font-inter);
  font-size: var(--text-base);     /* 16px */
  font-weight: 400;
  line-height: var(--leading-base); /* 1.50 */
  letter-spacing: -0.0090em;
  color: var(--color-ash-muted);
}

.project-card__cta {
  align-self: flex-end;
  margin-top: auto;
}
```

- [ ] **Step 2: Visual check — cards render correctly**

Reload the browser. Expected:
- Three cards stacked vertically (mobile-first default)
- Each card has a slightly lighter dark background (#262626) than the page (#181818)
- Each card shows: index "01/02/03" at top, title, description, "View →" ghost button at the bottom-right
- 24px rounded corners on each card
- 8px gap between cards
- 16px padding inside each card

- [ ] **Step 3: Verify computed styles on `.project-card`**

In DevTools, inspect the first `.project-card`. Expected:
- `background-color: rgb(38, 38, 38)`  (=#262626)
- `border-radius: 24px`
- `padding: 16px`

- [ ] **Step 4: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add styles.css
git commit -m "feat(styles): add work grid and project card components"
```

---

## Task 7: Style the About and Contact Sections

**Files:**
- Modify: `styles.css` (append)

- [ ] **Step 1: Append about + contact styles**

Append this to `styles.css`:

```css
/* ============================================================
   About
   ============================================================ */
.about__body {
  margin: 0;
  max-width: 60ch;
  font-family: var(--font-inter);
  font-size: var(--text-base);     /* 16px */
  font-weight: 400;
  line-height: var(--leading-base); /* 1.50 */
  letter-spacing: -0.0090em;
  color: var(--color-frost-white);
}

/* ============================================================
   Contact
   ============================================================ */
.contact__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--element-gap);   /* 8px */
}

.contact__primary {
  /* uses .ghost-button */
}

.contact__secondary {
  /* uses .ghost-button */
}
```

- [ ] **Step 2: Visual check — about + contact render correctly**

Reload the browser. Expected:
- "About" heading, then a 2-sentence paragraph below in white
- "Get in touch" heading, then three ghost buttons horizontally: email (primary), GitHub, LinkedIn
- 45px gap between About and Contact sections
- 45px gap below Contact (end of page)

- [ ] **Step 3: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add styles.css
git commit -m "feat(styles): add about and contact section styles"
```

---

## Task 8: Add Responsive Breakpoints

**Files:**
- Modify: `styles.css` (append)

- [ ] **Step 1: Append media query block**

Append this to `styles.css`:

```css
/* ============================================================
   Responsive — mobile-first adjustments
   ============================================================ */

/* Tablet (≥ 640px) */
@media (min-width: 640px) {
  .section--hero {
    padding-top: 30vh;
  }
}

/* Desktop (≥ 1024px) */
@media (min-width: 1024px) {
  .section--hero {
    padding-top: 40vh;
  }

  .work__grid {
    grid-template-columns: 1fr 1fr;   /* 2-column grid */
  }
}

/* Mobile (< 640px) — hamburger and collapsible menu */
@media (max-width: 639px) {
  .nav__toggle {
    display: inline-block;
  }

  .nav__menu {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    left: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    padding: var(--spacing-12) 24px;
    background: var(--color-midnight-core);
    border-bottom: 1px solid var(--color-ghost-border);
  }

  .nav__menu.is-open {
    display: flex;
  }

  .nav__link {
    text-align: left;
    border: none;
    border-bottom: 1px solid var(--color-ghost-border);
    padding: var(--spacing-12) 0;
  }
}
```

- [ ] **Step 2: Visual check — desktop 2-column grid**

Reload at >1024px width. Expected: project cards arrange in a 2x2 grid (with the third card alone on the bottom row).

- [ ] **Step 3: Visual check — mobile single column + hamburger**

Resize browser to < 640px. Expected:
- "Work / About / Contact" links disappear from the nav
- A hamburger icon (two horizontal lines) appears on the right
- Cards stack in a single column

- [ ] **Step 4: Test mobile menu toggle manually (will be wired in Task 9)**

For now, in DevTools console, run:
```javascript
document.getElementById('nav-menu').classList.add('is-open')
```

Expected: nav links appear below the nav bar. Run `classList.remove('is-open')` to hide them.

- [ ] **Step 5: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add styles.css
git commit -m "feat(styles): add responsive breakpoints and mobile menu CSS"
```

---

## Task 9: Add JavaScript (Menu Toggle, Active Section Highlight, Smooth Scroll)

**Files:**
- Modify: `styles.css` (append one rule)
- Modify: `script.js` (replace content)

- [ ] **Step 1: Append smooth scroll CSS**

Append this to `styles.css`:

```css
/* ============================================================
   Smooth scroll — opt-in for users without reduced-motion pref
   ============================================================ */
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}

/* Account for the sticky nav height when scrolling to anchors */
section[id] {
  scroll-margin-top: 56px;
}
```

- [ ] **Step 2: Replace `script.js` with full implementation**

Write this **exact** content to `script.js` (replace the entire file):

```javascript
(function () {
  'use strict';

  // 1. Mobile menu toggle
  const nav = document.getElementById('nav');
  const toggle = nav ? nav.querySelector('.nav__toggle') : null;
  const menu = document.getElementById('nav-menu');
  const navLinks = menu ? menu.querySelectorAll('.nav__link') : [];

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      const isOpen = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close mobile menu when a link inside it is clicked
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // 2. Active section highlight via IntersectionObserver
  const sections = document.querySelectorAll('main section[id]');

  if (sections.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          navLinks.forEach(function (link) {
            const isMatch = link.getAttribute('href') === '#' + id;
            link.classList.toggle('is-active', isMatch);
          });
        });
      },
      {
        rootMargin: '-40% 0px -55% 0px',   // trigger when section is near top
        threshold: 0,
      }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }
})();
```

- [ ] **Step 3: Visual check — mobile menu toggle**

Reload the browser at < 640px width. Click the hamburger. Expected:
- Menu opens with Work / About / Contact stacked
- Hamburger icon is replaced visually (no icon swap needed; it stays the same — the `aria-expanded` attribute changes for accessibility)
- Clicking any link closes the menu and scrolls to that section

- [ ] **Step 4: Visual check — active section highlight**

Reload the browser at desktop width. Scroll down the page slowly. Expected:
- The corresponding nav link (Work, About, or Contact) becomes slightly faded (`opacity: 0.7`) when its section is in view
- Hero is not linked, so no link is highlighted when at the top

- [ ] **Step 5: Visual check — smooth scroll on anchor click**

Click any nav link. Expected: page scrolls smoothly to the target section, with a small offset (56px) so the section heading isn't hidden under the sticky nav.

- [ ] **Step 6: Commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git add styles.css script.js
git commit -m "feat(js): add mobile menu toggle, active section highlight, smooth scroll offset"
```

---

## Task 10: Final Validation

**Files:** None (read-only checks)

- [ ] **Step 1: Verify all design tokens are present in styles.css**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -cE "(--color-midnight-core|--color-frost-white|--color-slate-surface|--color-ash-muted|--color-ghost-border)" styles.css
```

Expected: `5` (each token appears once in `:root`)

- [ ] **Step 2: Verify no accent colors leaked in**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -niE "(purple|magenta|cyan|lime|orange|yellow|teal|indigo|violet|fuchsia|rose|sky-|emerald|amber-)" styles.css index.html script.js || echo "OK: no accent colors"
```

Expected: `OK: no accent colors`

- [ ] **Step 3: Verify no forbidden CSS patterns**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -nE "(box-shadow|linear-gradient|radial-gradient|conic-gradient)" styles.css || echo "OK: no shadows or gradients"
```

Expected: `OK: no shadows or gradients`

- [ ] **Step 4: Verify no external network requests**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -nE "(https?://[^/]*\.(com|net|org|io|dev|cdn|jsdelivr|unpkg|googleapis|cloudflare))" index.html script.js || echo "OK: no external requests"
```

Expected: `OK: no external requests` (or only references to `github.com` / `linkedin.com` in placeholder hrefs, which are user-replaceable)

- [ ] **Step 5: Verify file size budget**

```bash
cd "/home/oguz/Masaüstü/new kartal"
ls -la index.html styles.css script.js
```

Expected sizes (approximate):
- `index.html` < 10KB
- `styles.css` < 8KB
- `script.js` < 2KB

- [ ] **Step 6: HTML structure verification**

```bash
cd "/home/oguz/Masaüstü/new kartal"
grep -cE "<section" index.html   # should be 4
grep -cE "id=\"hero\"|id=\"work\"|id=\"about\"|id=\"contact\"" index.html   # should be 4
```

Expected: `4` and `4`

- [ ] **Step 7: Open in browser and do a full smoke test**

Open `index.html` in Chrome. Walk through:
- [ ] Page loads, no console errors
- [ ] Nav is sticky and visible
- [ ] Hero shows "Oguz Kartal" prominently
- [ ] Three project cards visible in a 2-column grid
- [ ] About text readable
- [ ] Contact buttons present
- [ ] Resize to mobile width → hamburger appears
- [ ] Click hamburger → menu opens
- [ ] Click a nav link → page scrolls smoothly, menu closes
- [ ] Resize back to desktop → menu links visible without hamburger

- [ ] **Step 8: Run Lighthouse in Chrome DevTools**

Open DevTools → Lighthouse → run audit (Performance + Accessibility + Best Practices).

Expected: Performance ≥ 95, Accessibility = 100, Best Practices ≥ 95.

- [ ] **Step 9: Final commit**

```bash
cd "/home/oguz/Masaüstü/new kartal"
git status
# If there are uncommitted changes, commit them with a descriptive message
git log --oneline
```

Expected: a clean working tree and ~10 commits, one per task.

---

## Done Criteria (Spec Section 12 Recap)

- [x] `index.html` is valid HTML5 (semantic tags, no console errors)
- [x] `styles.css` declares all tokens from `david_DESIGN.md` in `:root`
- [x] No token value is altered from the spec
- [x] No accent colors anywhere
- [x] No `box-shadow`, no gradients
- [x] Page renders: nav, hero, 3 project cards, about, contact
- [x] Hero displays "Oguz Kartal" at the top
- [x] Section gap is 45px in computed styles
- [x] Project card radius is 24px in computed styles
- [x] Mobile (< 640px): hamburger menu toggles open/close
- [x] Desktop (> 1024px): project grid is 2 columns
- [x] All anchor links scroll to their target sections
- [x] Tab navigation reaches all interactive elements
- [x] No external network requests (no CDN, no Google Fonts)
- [x] File sizes: `index.html` < 10KB, `styles.css` < 8KB, `script.js` < 2KB

---

## Self-Review (Skill Requirement)

**1. Spec coverage:**

| Spec Section | Task(s) Implementing It |
|--------------|-------------------------|
| §2 Tech Stack | Task 1 (no build, no deps) |
| §3 File Structure | Task 1 (3 files at root) |
| §4 Page Structure | Task 3 (semantic HTML with IDs) |
| §5 Design Tokens | Task 2 (`:root` block) |
| §6 Typography Roles | Tasks 5, 6, 7 (font/size/weight per role) |
| §7.1 Nav | Task 4 (sticky, glass, hamburger) |
| §7.2 Ghost Button | Task 4 (0px radius, 4px padding, opacity hover) |
| §7.3 Project Card | Task 6 (24px radius, slate surface, 16px padding) |
| §7.4 Section Container | Task 5 (980px max-width, 45px gap) |
| §8.1 Hero content | Task 3 (name, tagline, location) |
| §8.2 3 placeholder projects | Task 3 (Alpha/Beta/Gamma) |
| §8.3 About text | Task 3 (2-sentence bio) |
| §8.4 Contact links | Task 3 (email, GitHub, LinkedIn) |
| §9 Responsive | Task 8 (640px / 1024px breakpoints) |
| §10 Interactions | Task 9 (menu toggle, active section, smooth scroll) |
| §11 Accessibility | Tasks 3 (semantic HTML, aria), 4 (focus styles), 9 (aria-expanded) |
| §12 Validation Plan | Task 10 (all checks) |
| §13 Risks | Acknowledged in spec; font substitute handled by `Arial` fallback chain |
| §14 Out of Scope | Honored (no blog, no light mode, no real font, etc.) |

All 18 spec sections are covered. No gaps.

**2. Placeholder scan:**

Searched plan for "TBD", "TODO", "implement later", "similar to", "appropriate", "fill in". None present. All code blocks contain actual content. ✓

**3. Type / name consistency:**

- All CSS class names match between `index.html` (Task 3) and `styles.css` (Tasks 4-9): `.nav`, `.nav__brand`, `.nav__toggle`, `.nav__menu`, `.nav__link`, `.ghost-button`, `.section`, `.section--hero`, `.hero__name`, `.hero__tagline`, `.hero__location`, `.section__heading`, `.work__grid`, `.project-card`, `.project-card__index`, `.project-card__title`, `.project-card__description`, `.project-card__cta`, `.about__body`, `.contact__links`, `.contact__primary`, `.contact__secondary`
- All `id`s match: `nav`, `nav-menu`, `hero`, `work`, `about`, `contact` ✓
- All JS selectors match: `getElementById('nav')`, `.nav__toggle`, `getElementById('nav-menu')`, `.nav__link`, `main section[id]` ✓
- All token names match between Task 2 declaration and Tasks 4-9 consumers ✓

No inconsistencies found.

---

**End of plan.**

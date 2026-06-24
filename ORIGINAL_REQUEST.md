# Original User Request

## Initial Request — 2026-06-24T10:12:29+07:00

Refactor and redesign all remaining admin HTML pages (excluding index.html and orders.html which are already done) to use Tailwind CSS v4 and Lucide icons. The final UI must be premium, highly responsive, and user-friendly, matching the design system established in the completed pages.

Working directory: c:\Users\Digital Marketing\OneDrive\Desktop\project\PROD_REPO_ANALYSIS
Integrity mode: development

## Requirements

### R1. Consistent Design System
Use `index.html` and `orders.html` as the reference for the new UI layout, styling (Tailwind CSS v4), and iconography (Lucide icons). Replicate their exact sidebar and topbar structure.

### R2. Responsive Layout
Ensure all pages are fully responsive, with mobile-friendly bottom navigation and proper sidebar handling for desktop, identical to the reference pages.

### R3. Remove Old Assets
Eliminate all usages of the old custom CSS (`style.css`, `admin-desktop.css`) and emojis across the remaining admin pages. Replace emojis with appropriate `<i data-lucide="..."></i>` icons.

## Verification

**Agent-as-judge**: An independent verification subagent will review the code of each refactored file to ensure it meets the Acceptance Criteria.

## Acceptance Criteria

### UI Quality and Consistency
- [ ] No occurrences of `style.css` or `admin-desktop.css` in `<link>` tags across admin HTML files.
- [ ] No emoji characters exist in the HTML files.
- [ ] All remaining admin HTML files use the same layout wrapper (Sidebar + Topbar + Mobile Bottom Nav) found in `index.html` and `orders.html`.

# Plan - Refactoring Admin HTML Pages to Tailwind CSS v4 and Lucide

## Goal
Refactor all admin HTML pages (excluding index.html and orders.html) to Tailwind CSS v4 and Lucide icons, matching the design of index.html/orders.html, ensuring responsiveness, and removing legacy CSS.

## Step-by-Step Plan

### Phase 1: Discovery & Layout Extraction
- **Step 1.1**: Find all HTML files in the project directory. Identify the remaining admin HTML pages.
- **Step 1.2**: Extract the layout of `index.html` and `orders.html` (the premium sidebar, topbar, responsive rules, Tailwind CSS v4 source, and Lucide configuration).
- **Step 1.3**: Document the design system and layouts in `PROJECT.md` at root.

### Phase 2: Refactoring Execution
- **Step 2.1**: Refactor each admin HTML page individually using Explorer -> Worker -> Reviewer -> Auditor cycle.
  - Page 1: [TBD]
  - Page 2: [TBD]
  - ...
- **Step 2.2**: Remove references to `style.css` and `admin-desktop.css` on each page.
- **Step 2.3**: Replace emojis with Lucide icons (using `<i data-lucide="icon-name"></i>` or whatever syntax index.html uses).

### Phase 3: Cleanup & Verification
- **Step 3.1**: Check that `style.css` and `admin-desktop.css` can be safely deleted, and delete them if no other dependencies exist.
- **Step 3.2**: Run E2E verification or visual checks (via subagents).
- **Step 3.3**: Write the final orchestrator handoff.

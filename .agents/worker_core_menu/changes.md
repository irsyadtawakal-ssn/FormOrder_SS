# Worker Changes - Milestone 1: Core & Menu Management

Refactored the three target admin HTML files to adopt Tailwind CSS v4 and Lucide icons, while replicating the modern layout shell from the baseline files (`admin/index.html` and `admin/orders.html`).

## Target Files & Refactoring Summary

### 1. `admin/login.html`
- **Styling Overhaul**: Removed the reference to legacy stylesheet `style.css` (Line 7). Added Tailwind CSS v4 CDN script and Lucide icons library in `<head>`.
- **Layout Restructuring**: Replaced the constrained `.phone` container class with a full-height vertically/horizontally centered Tailwind flex grid (`flex min-h-screen flex-col items-center justify-center p-4`). Styled the form card, inputs, label headers, action buttons, and error panels using Tailwind CSS v4 utility classes.
- **Emoji & Fallback Mapping**: Replaced the raw fallback emoji `🌯` inside the logo image `onerror` attribute with a Lucide `utensils` icon, calling `window.lucide.createIcons()` inside the callback to dynamically render the SVG fallback.
- **JS Preservation**: Retained all original Supabase client initialization, redirect check block, authentication form logic, error output wrapper, and keyboard event handlers.

### 2. `admin/menu.html`
- **Styling Overhaul**: Removed references to legacy stylesheets `style.css` and `admin-desktop.css`. Added Tailwind CSS v4 compiler and Lucide library in `<head>`.
- **Responsive Layout Wrapper**: Replaced the mobile-restricted `.phone` body wrapper with the responsive flex grid from `index.html` (`flex h-screen overflow-hidden`).
- **Sidebar Integration**: Incorporated the standard desktop `<aside>` sidebar with the **Menu** navigation link correctly highlighted in active colors (`text-brand bg-brand-bg`).
- **Header & Action Bar**: Restructured the sticky header to show user metadata (name and role) on mobile, and the "+ Tambah Menu" / "Bulk Upload" actions on desktop.
- **Mobile Bottom Navigation**: Integrated the fixed bottom tab bar on mobile with Lucide icons matching the layout in `index.html` (Dashboard, Pesanan, Menu, Laporan, Pengaturan).
- **Emoji Replacement**: Mapped raw emojis (e.g. `🌯`, `🏠`, `📋`, `🚪`, `🍽️`, `★`) to their respective Lucide icons (`utensils`, `layout-dashboard`, `clipboard-list`, `log-out`, `inbox`, `star`).
- **Modal Custom Styling**: Defined legacy modal overlay and card styling classes (like `admin-modal-overlay`, `admin-modal-card`, etc.) via the Tailwind `@utility` directive inside the page style block, avoiding any visual breaks or JS selector malfunctions in the dynamic modal sheets.
- **Dynamic Lucide Rendering**: Injected `window.lucide.createIcons()` calls inside page initialization, category tab render loops, search/filter handlers (`renderList`), and modal open scripts (`openItemForm`, `openVariantManager`, `openVariantForm`, `openOptionForm`).

### 3. `admin/bulk-photos.html`
- **Styling Overhaul**: Removed reference to legacy stylesheet `style.css` and added Tailwind CSS v4 script and Lucide library.
- **Responsive Layout Wrapper**: Adopted the identical flex layout as `admin/menu.html` (desktop sidebar + topbar with back-to-menu chevron action + main content body + mobile bottom navigation). Highlighted **Menu** as the active sidebar link.
- **Card-Based UI Overhaul**: Replaced the legacy `.info-card` element styles with modern Tailwind utility classes. Redesigned Step 1 (dashed photo dropzone / upload banner) and Step 2 (match review list and summary alert block) using responsive Tailwind utility classes.
- **Emoji & Symbol Mapping**: Replaced emojis (`‹`, `📷`, `1️⃣`, `🖼️`, `2️⃣`, `🚀`, `📋`, `✅`, `⬜`, `📄`, `🎉`, `⏳`) with modern Lucide icons (`chevron-left`, `camera`, circle number badges, `image`, `upload`, `clipboard-list`, `check-circle-2` / `check`, `image-off`, `file-text`, `party-popper`, and rotating `loader-2`).
- **JS & Upload Preservation**: Preserved file parsing, similarity-based matching algorithm (`bestMatch`), match override selector callback, progress state trackers, and chunks upload loops using Supabase Storage client.
- **Dynamic Lucide Rendering**: Added `window.lucide.createIcons()` invocations inside matching results drawers (`renderMatches`, `onMatchChange`), upload loop status hooks, and the main page initialization blocks.

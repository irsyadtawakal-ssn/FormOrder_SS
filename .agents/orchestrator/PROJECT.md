# Project: Refactor SUKA Admin HTML Pages to Tailwind CSS v4 and Lucide

## Architecture
The application is a pure client-side HTML/JS application backed by Supabase.
All style and desktop/mobile responsiveness will be migrated from legacy `style.css` and `admin-desktop.css` to Tailwind CSS v4 utility classes.
Icons will be migrated from raw emojis/text to SVG-based Lucide icons (loaded via unpkg).
Global configurations (Supabase connection, themes, shared functions) are defined in:
- `config.js`
- `assets/js/supabase.js`
- `assets/js/utils.js`
- `assets/js/admin.js`

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Core & Menu Management | `login.html`, `menu.html`, `bulk-photos.html` | None | PLANNED |
| 2 | Ops & Access Control | `outlets.html`, `users.html`, `settings.html` | M1 | PLANNED |
| 3 | Marketing & Data Management | `customers.html`, `promos.html`, `vouchers.html`, `import.html` | M1 | PLANNED |
| 4 | Observability & Reports | `reports.html`, `monitoring.html` | M2, M3 | PLANNED |

## Interface Contracts
All pages interact with the same database schemas via Supabase (`window.db`).
Authentication is managed via `requireAuth()` helper defined in `admin.js` which resolves current user profile.
Role-based access is implemented dynamically via `.admin-only` elements shown/hidden based on role matching (`super_admin` vs `outlet_staff`).

## Code Layout
Legacy CSS files to be cleaned up:
- `assets/css/style.css`
- `assets/css/admin-desktop.css`
- (Note: confirm no customer-facing pages depend on `style.css` before final deletion)

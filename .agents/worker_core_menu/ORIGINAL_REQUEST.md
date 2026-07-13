## 2026-06-24T03:15:47Z
You are worker_core_menu.
Task: Refactor the following admin HTML pages to adopt Tailwind CSS v4 and Lucide icons:
1. `admin/login.html`
2. `admin/menu.html`
3. `admin/bulk-photos.html`

Requirements:
- Replicate the sidebar and topbar structure of `admin/index.html` and `admin/orders.html` across the admin pages (except `login.html`, which is a clean card-based layout without navigation headers).
- Ensure pages are fully responsive, with mobile bottom navigation and desktop sidebar.
- Remove references to `style.css` and `admin-desktop.css` in these three pages.
- Replace raw emojis with Lucide icons (using <i data-lucide="icon-name"></i>).
- Carefully preserve all functional JavaScript behavior and elements (such as class bindings, IDs, inline attributes, onclick handers, window.db calls, dynamic loaders, form values, and error banners).
- Inject 'lucide.createIcons()' calls where dynamic elements or templates are loaded so icons render correctly.
- Refer to the detailed analysis consensus in `.agents/orchestrator/synthesis_milestone_1.md` and the baseline structures in `admin/index.html` and `admin/orders.html`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write a summary of changes in `.agents/worker_core_menu/changes.md` and write a handoff.md file in `.agents/worker_core_menu/` when you are done. Send a message back to the orchestrator (conversation ID 35d2c083-d743-4589-ae1d-d1094f6d414b) reporting completion.

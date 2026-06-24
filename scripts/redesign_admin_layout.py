import os
import re

ADMIN_DIR = r"c:\Users\Digital Marketing\OneDrive\Desktop\project\PROD_REPO_ANALYSIS\admin"

# Lucide icon mapping
ICON_MAP = {
    "🏠": "layout-dashboard",
    "📋": "clipboard-list",
    "🌯": "utensils",
    "📊": "bar-chart-2",
    "🧑‍🤝‍🧑": "users",
    "🏷️": "tag",
    "📍": "map-pin",
    "👥": "user-cog",
    "🔍": "activity",
    "⚙️": "settings",
    "🚪": "log-out",
    "🛍️": "shopping-bag",
    "💰": "dollar-sign",
    "⏳": "clock",
    "🎉": "party-popper",
    "✅": "check-circle",
    "❌": "x-circle",
    "📝": "file-text",
    "👍": "thumbs-up",
    "🛒": "shopping-cart"
}

def replace_emojis(html_content):
    # This is a bit brute-force, but since we know the exact emojis used, it's safe enough.
    # We will replace spans or direct text containing the emojis with lucide icons.
    # E.g., <span>🏠</span> -> <i data-lucide="layout-dashboard"></i>
    
    for emoji, icon in ICON_MAP.items():
        # Replace emoji inside span
        html_content = re.sub(
            f'<span>{emoji}</span>', 
            f'<i data-lucide="{icon}" class="lucide-icon"></i>', 
            html_content
        )
        # Replace bare emoji
        html_content = html_content.replace(emoji, f'<i data-lucide="{icon}" class="lucide-icon inline-icon"></i>')
        
    return html_content

def update_html_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Change <div class="phone"> to <div class="admin-layout">
    # Some pages might have inline styles on phone, e.g., login.html
    content = re.sub(r'<div class="phone"[^>]*>', '<div class="admin-layout">', content)
    
    # Also change it if it doesn't have attributes
    content = content.replace('<div class="phone">', '<div class="admin-layout">')

    # 2. Add Lucide script in head
    if '<script src="https://unpkg.com/lucide@latest"></script>' not in content:
        content = content.replace('</head>', '  <script src="https://unpkg.com/lucide@latest"></script>\n</head>')
        
    # 3. Add lucide.createIcons() before </body>
    if 'lucide.createIcons()' not in content:
        content = content.replace('</body>', '  <script>\n    if (typeof lucide !== "undefined") { lucide.createIcons(); }\n  </script>\n</body>')

    # 4. Replace emojis with real icons
    content = replace_emojis(content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    for filename in os.listdir(ADMIN_DIR):
        if filename.endswith(".html"):
            update_html_file(os.path.join(ADMIN_DIR, filename))
    print("Updated all admin HTML files with Lucide icons and new layout class.")

if __name__ == "__main__":
    main()

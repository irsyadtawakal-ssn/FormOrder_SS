const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, '../admin');

// Lucide icon mapping
const ICON_MAP = {
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
};

function replaceEmojis(htmlContent) {
    for (const [emoji, icon] of Object.entries(ICON_MAP)) {
        // Replace emoji inside span
        htmlContent = htmlContent.split(`<span>${emoji}</span>`).join(`<i data-lucide="${icon}" class="lucide-icon"></i>`);
        // Replace bare emoji
        htmlContent = htmlContent.split(emoji).join(`<i data-lucide="${icon}" class="lucide-icon inline-icon"></i>`);
    }
    return htmlContent;
}

function updateHtmlFile(filepath) {
    let content = fs.readFileSync(filepath, 'utf8');

    // 1. Change <div class="phone" ...> to <div class="admin-layout" ...>
    content = content.replace(/<div class="phone"([^>]*)>/g, '<div class="admin-layout"$1>');
    
    // Also change exact match just in case
    content = content.replace(/<div class="phone">/g, '<div class="admin-layout">');

    // 2. Add Lucide script in head
    if (!content.includes('unpkg.com/lucide')) {
        content = content.replace('</head>', '  <script src="https://unpkg.com/lucide@latest"></script>\n</head>');
    }
        
    // 3. Add lucide.createIcons() before </body>
    if (!content.includes('lucide.createIcons()')) {
        content = content.replace('</body>', '  <script>\n    if (typeof lucide !== "undefined") { lucide.createIcons(); }\n  </script>\n</body>');
    }

    // 4. Replace emojis with real icons
    content = replaceEmojis(content);
    
    fs.writeFileSync(filepath, content, 'utf8');
}

function main() {
    const files = fs.readdirSync(ADMIN_DIR);
    for (const filename of files) {
        if (filename.endsWith(".html")) {
            updateHtmlFile(path.join(ADMIN_DIR, filename));
        }
    }
    console.log("Updated all admin HTML files with Lucide icons and new layout class.");
}

main();

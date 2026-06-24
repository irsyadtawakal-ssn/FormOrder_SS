const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '../admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html') && f !== 'login.html');

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let html = fs.readFileSync(filePath, 'utf8');
  
  // Find everything inside <div class="admin-content"> up to </div><!-- /admin-content -->
  const contentMatch = html.match(/<div class="admin-content">([\s\S]*?)<\/div>\s*<!-- \/admin-content -->/);
  
  if (contentMatch) {
    let pageContentInner = contentMatch[1];
    
    // Now we construct the new HTML top to bottom to guarantee valid DOM!
    let scriptsMatch = html.match(/<script[\s\S]*?<\/html>/i);
    let scriptsAndBottom = scriptsMatch ? scriptsMatch[0] : '';
    
    // Replace emojis left behind in other pages
    pageContentInner = pageContentInner
      .replace(/<span>🏠<\/span>/g, '<i data-lucide="layout-dashboard" class="w-5 h-5"></i>')
      .replace(/<span>📋<\/span>/g, '<i data-lucide="clipboard-list" class="w-5 h-5"></i>')
      .replace(/<span>🌯<\/span>/g, '<i data-lucide="utensils" class="w-5 h-5"></i>')
      .replace(/<span>📊<\/span>/g, '<i data-lucide="bar-chart-2" class="w-5 h-5"></i>')
      .replace(/<span>🔍<\/span>/g, '<i data-lucide="activity" class="w-5 h-5"></i>')
      .replace(/<span>⚙️<\/span>/g, '<i data-lucide="settings" class="w-5 h-5"></i>')
      .replace(/<span>🎟️<\/span>/g, '<i data-lucide="ticket" class="w-5 h-5"></i>')
      .replace(/<span>📍<\/span>/g, '<i data-lucide="map-pin" class="w-5 h-5"></i>')
      .replace(/<span>👥<\/span>/g, '<i data-lucide="users" class="w-5 h-5"></i>')
      .replace(/<span>🏷️<\/span>/g, '<i data-lucide="tag" class="w-5 h-5"></i>')
      .replace(/<span>👤<\/span>/g, '<i data-lucide="user-cog" class="w-5 h-5"></i>');
    
    let newHtml = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Dashboard — SUKA Admin</title>
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#f29744" />
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<style type="text/tailwindcss">
  @theme {
    --color-brand: #f29744;
    --color-brand-bg: #fff8f1;
    --color-brand-dark: #d87c2b;
  }
</style>
</head>
<body class="bg-gray-50 text-gray-900 font-sans antialiased">
<div class="flex h-screen overflow-hidden">
  
  <!-- Sidebar -->
  <aside class="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-full">
    <div class="p-6 border-b border-gray-200 flex items-center gap-3">
      <i data-lucide="utensils" class="text-brand w-6 h-6"></i>
      <span class="font-extrabold text-xl text-brand">SUKA Admin</span>
    </div>
    <div class="px-6 py-4 flex flex-col gap-1 border-b border-gray-200 bg-gray-50">
      <span class="text-sm font-bold text-gray-800" id="sidebarName">—</span>
      <span class="text-xs font-medium text-gray-500" id="sidebarRole">—</span>
    </div>
    <nav class="flex-1 overflow-y-auto py-4 flex flex-col gap-2 px-3">
      <a href="/admin/index.html" class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="layout-dashboard" class="w-5 h-5"></i><span>Dashboard</span></a>
      <a href="/admin/orders.html" class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="clipboard-list" class="w-5 h-5"></i><span>Pesanan</span></a>
      <a href="/admin/menu.html" class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="utensils" class="w-5 h-5"></i><span>Menu</span></a>
      <a href="/admin/reports.html" class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="bar-chart-2" class="w-5 h-5"></i><span>Laporan</span></a>
      <a href="/admin/customers.html" class="admin-only flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="users" class="w-5 h-5"></i><span>Pelanggan</span></a>
      <a href="/admin/promos.html" class="admin-only flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="tag" class="w-5 h-5"></i><span>Promo</span></a>
      <a href="/admin/outlets.html" class="admin-only flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="map-pin" class="w-5 h-5"></i><span>Outlet</span></a>
      <a href="/admin/users.html" class="admin-only flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="user-cog" class="w-5 h-5"></i><span>Pengguna</span></a>
      <a href="/admin/monitoring.html" class="admin-only flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="activity" class="w-5 h-5"></i><span>Monitoring</span></a>
      <a href="/admin/settings.html" class="admin-only flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-brand font-medium transition-colors"><i data-lucide="settings" class="w-5 h-5"></i><span>Pengaturan</span></a>
    </nav>
    <div class="p-4 border-t border-gray-200">
      <button onclick="adminSignOut()" class="flex items-center justify-center gap-2 text-red-600 bg-red-50 hover:bg-red-100 py-2.5 px-4 rounded-xl w-full transition-colors font-bold shadow-sm">
        <i data-lucide="log-out" class="w-5 h-5"></i> Keluar
      </button>
    </div>
  </aside>

  <!-- Main Content -->
  <div class="flex-1 flex flex-col h-full overflow-hidden relative">
    
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
      <div class="flex items-center gap-3">
        <img src="../assets/img/logo.png" alt="SUKA" class="h-8 w-auto md:hidden" onerror="this.style.display='none'">
        <div class="flex flex-col md:hidden">
          <span class="text-xs font-bold text-gray-800" id="adminNameMobile">—</span>
          <span class="text-[10px] text-gray-500 font-medium" id="adminRoleMobile">—</span>
        </div>
        <div class="hidden md:block font-bold text-gray-800 text-lg">Panel Admin</div>
      </div>
      <button onclick="adminSignOut()" class="md:hidden flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
        <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Keluar
      </button>
    </header>

    <!-- Scrollable Content Area -->
    <main class="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 bg-gray-50">
      <div class="max-w-7xl mx-auto space-y-6">
        ${pageContentInner}
      </div>
    </main>
  </div>
  
  <!-- Mobile Bottom Nav -->
  <nav class="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex items-center justify-around pb-safe pt-1 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
    <a href="/admin/index.html" class="flex flex-col items-center gap-1 py-2 px-2 text-gray-500 hover:text-brand"><i data-lucide="layout-dashboard" class="w-5 h-5"></i><span class="text-[10px] font-medium">Dashboard</span></a>
    <a href="/admin/orders.html" class="flex flex-col items-center gap-1 py-2 px-2 text-gray-500 hover:text-brand"><i data-lucide="clipboard-list" class="w-5 h-5"></i><span class="text-[10px] font-medium">Pesanan</span></a>
    <a href="/admin/menu.html" class="flex flex-col items-center gap-1 py-2 px-2 text-gray-500 hover:text-brand"><i data-lucide="utensils" class="w-5 h-5"></i><span class="text-[10px] font-medium">Menu</span></a>
    <a href="/admin/reports.html" class="flex flex-col items-center gap-1 py-2 px-2 text-gray-500 hover:text-brand"><i data-lucide="bar-chart-2" class="w-5 h-5"></i><span class="text-[10px] font-medium">Laporan</span></a>
    <a href="/admin/settings.html" class="admin-only flex flex-col items-center gap-1 py-2 px-2 text-gray-500 hover:text-brand"><i data-lucide="settings" class="w-5 h-5"></i><span class="text-[10px] font-medium">Settings</span></a>
  </nav>
</div>

<div class="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium opacity-0 transition-opacity pointer-events-none z-50" id="toast"></div>

${scriptsAndBottom}
`;

    if (!newHtml.includes('lucide.createIcons()')) {
      newHtml = newHtml.replace('</body>', '<script>if(typeof lucide !== "undefined") { lucide.createIcons(); }</script>\n</body>');
    }
    
    fs.writeFileSync(filePath, newHtml, 'utf8');
    console.log('Migrated', file);
  } else {
    console.log('Could not find admin-content in', file);
  }
}

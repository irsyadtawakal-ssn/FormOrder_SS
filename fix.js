const fs = require('fs');

const content = fs.readFileSync('index.html', 'utf8');

const startMarker = "const options    = optRes.data || [];";
const endMarker = "if (!sections.length) {";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.error('Failed to find markers', startIdx, endIdx);
    process.exit(1);
}

const replacement = `const options    = optRes.data || [];
  const overrides  = overrideRes.data || [];

  const overrideMap = {};
  overrides.forEach(o => { overrideMap[o.menu_item_id] = o; });

  const optsByVariant = {};
  options.forEach(o => { (optsByVariant[o.variant_id] = optsByVariant[o.variant_id] || []).push(o); });

  const varsByItem = {};
  variants.forEach(v => {
    (varsByItem[v.menu_item_id] = varsByItem[v.menu_item_id] || []).push({ ...v, options: optsByVariant[v.id] || [] });
  });

  const catMap = {};
  categories.forEach(c => { catMap[c.id] = { ...c, items: [] }; });

  items.forEach(item => {
    const ov = overrideMap[item.id];
    const enriched = {
      ...item,
      effectivePrice: ov?.price_override ?? item.base_price,
      compare_price:  item.compare_price ?? null,
      isAvailable:    ov ? ov.is_available : true,
      variants:       varsByItem[item.id] || []
    };
    if (catMap[item.category_id]) catMap[item.category_id].items.push(enriched);
  });

  menuData = categories.map(c => catMap[c.id]).filter(c => c && c.items.length > 0);

  document.getElementById('searchWrap').style.display = 'block';
  document.getElementById('tabs').style.display = 'flex';
  const btnCart = document.getElementById('btnCart');
  if (btnCart) btnCart.style.display = '';

  renderTabs();
  renderMenu();
  sukaPixelTrack('ViewContent', { content_name: outlet.name, content_category: 'Menu Outlet' });
}

function showMenuSkeleton() {
  document.getElementById('menuContent').innerHTML = \`
    <div class="outlet-list" style="margin-top:12px">
      \${Array.from({length: 4}, () => \`
        <div class="skeleton-card">
          <div class="skeleton skeleton-photo"></div>
          <div class="skeleton-lines">
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line shorter"></div>
          </div>
        </div>\`).join('')}
    </div>\`;
}

// ─── Render tabs ──────────────────────────────────────────────────────────────
function renderTabs() {
  const allCats = [
    { id: 'Semua', label: 'Semua' },
    { id: 'Best Seller', label: '<i data-lucide="star" style="width:14px;height:14px;vertical-align:text-bottom;fill:currentColor"></i> Best Seller' },
    ...menuData.map(c => ({ id: c.name, label: c.name }))
  ];
  document.getElementById('tabs').innerHTML = allCats.map(c =>
    \`<div class="tab \${c.id === activeCategory ? 'active' : ''}" onclick="setCategory('\${c.id.replace(/'/g, "\\\\\\'")}')">\${c.label}</div>\`
  ).join('');
}

function setCategory(c) {
  activeCategory = c;
  renderTabs();
  renderMenu();
  const el = document.getElementById('section-' + encodeURIComponent(c));
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Render menu items ─────────────────────────────────────────────────────────
function onSearch() { renderMenu(); }

function renderMenu() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();

  let sections = menuData.map(cat => ({
    ...cat,
    items: cat.items.filter(item => {
      if (activeCategory === 'Best Seller' && !item.is_best_seller) return false;
      if (activeCategory !== 'Semua' && activeCategory !== 'Best Seller' && cat.name !== activeCategory) return false;
      if (q && !item.name.toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q)) return false;
      return true;
    })
  })).filter(cat => cat.items.length > 0);

  `;

const newContent = content.substring(0, startIdx) + replacement + content.substring(endIdx);

fs.writeFileSync('index.html', newContent, 'utf8');
console.log('Success');

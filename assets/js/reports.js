// assets/js/reports.js — Logic halaman laporan

let _user       = null; // adminUser dari admin.js
let _chartInst  = null; // instance Chart.js
let _rawData    = [];   // rows [{date, outlet_name, item_name, qty, unit_price}]
let _sortCol    = 'date';
let _sortAsc    = false;
let _menuItemsMap = {}; // map menu name to photo_url

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

(async function init() {
  _user = await requireAuth();
  if (!_user) return;

  // Tampilkan outlet filter hanya untuk super_admin
  if (_user.role === 'super_admin') {
    await _populateOutletFilter();
    document.getElementById('outletFilter').style.display = 'block';
  }

  // Default: 7 hari terakhir
  _setDefaultDates();
  await loadReport();
})();

// ─── Date helpers ─────────────────────────────────────────────────────────────

function _setDefaultDates() {
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6); // 7 hari inklusif
  document.getElementById('dateTo').value   = _toYmd(to);
  document.getElementById('dateFrom').value = _toYmd(from);
}

function _toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _getActiveDates() {
  const preset = document.getElementById('rangePreset').value;
  const today  = new Date();
  let from, to;

  if (preset === 'today') {
    from = to = _toYmd(today);
  } else if (preset === '7d') {
    const f = new Date(); f.setDate(f.getDate() - 6);
    from = _toYmd(f); to = _toYmd(today);
  } else if (preset === '30d') {
    const f = new Date(); f.setDate(f.getDate() - 29);
    from = _toYmd(f); to = _toYmd(today);
  } else {
    from = document.getElementById('dateFrom').value;
    to   = document.getElementById('dateTo').value;
  }
  return { from, to };
}

// Hitung tanggal periode sebelumnya (panjang sama)
function _prevPeriod(from, to) {
  const msFrom = new Date(from).getTime();
  const msTo   = new Date(to).getTime();
  const len    = msTo - msFrom + 86400000; // inklusif
  const prevTo   = new Date(msFrom - 86400000);
  const prevFrom = new Date(msFrom - len);
  return { from: _toYmd(prevFrom), to: _toYmd(prevTo) };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function onPresetChange() {
  const val  = document.getElementById('rangePreset').value;
  const wrap = document.getElementById('customRange');
  wrap.style.display = val === 'custom' ? 'flex' : 'none';
}

async function _populateOutletFilter() {
  const { data } = await window.db
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (!data) return;
  const sel = document.getElementById('outletFilter');
  data.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id; opt.textContent = o.name;
    sel.appendChild(opt);
  });
  
  if (window.outletTsInstance) {
    window.outletTsInstance.destroy();
  }
  window.outletTsInstance = new TomSelect('#outletFilter', {
    create: false,
    placeholder: 'Cari Outlet...',
    sortField: { field: "text", direction: "asc" }
  });
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function _fetchRows(from, to, outletId) {
  let q = window.db
    .from('orders')
    .select(`
      id,
      order_number,
      created_at,
      outlet_id,
      outlets(name),
      order_items(quantity, unit_price, item_name)
    `)
    .in('status', ['paid', 'preparing', 'ready', 'done'])
    .gte('created_at', from + 'T00:00:00+07:00')
    .lte('created_at', to   + 'T23:59:59+07:00');

  if (outletId) q = q.eq('outlet_id', outletId);

  const { data, error } = await q;
  if (error) { console.error('Fetch error:', error); return []; }

  // Flatten: satu baris per item
  const rows = [];
  const hideTest = document.getElementById('hideTestOrders') ? document.getElementById('hideTestOrders').checked : false;

  (data || []).forEach(order => {
    // Filter fitur sementara: lewati order jika mengandung item berbau "test", "tes", atau "coba"
    if (hideTest) {
      const hasTest = (order.order_items || []).some(item => {
        const name = String(item.item_name || '').toLowerCase();
        return name.includes('test') || name.includes('tes ') || name === 'tes' || name.includes('coba');
      });
      if (hasTest) return;
    }

    (order.order_items || []).forEach(item => {
      rows.push({
        order_id:    order.id,
        order_number: order.order_number,
        date:        order.created_at.split('T')[0],
        time:        order.created_at.split('T')[1].substring(0, 5),
        outlet_name: order.outlets?.name || '—',
        item_name:   item.item_name,
        qty:         item.quantity,
        unit_price:  item.unit_price,
        subtotal:    item.quantity * item.unit_price,
      });
    });
  });
  return rows;
}

// ─── Main load ────────────────────────────────────────────────────────────────

async function loadReport() {
  const { from, to }  = _getActiveDates();
  const outletId = _user.role === 'super_admin'
    ? document.getElementById('outletFilter').value
    : _user.outlet_id;

  // Tampilkan skeleton
  _renderMetricsSkeleton();
  document.getElementById('podiumWrap').innerHTML =
    '<div class="report-empty" style="flex:1">Memuat data...</div>';
  document.getElementById('tableWrap').innerHTML =
    '<div class="report-empty">Memuat data...</div>';

  // Fetch periode aktif + periode sebelumnya (untuk growth)
  const prev = _prevPeriod(from, to);
  const [rows, rowsPrev, menuData] = await Promise.all([
    _fetchRows(from, to, outletId),
    _fetchRows(prev.from, prev.to, outletId),
    window.db.from('menu_items').select('name, photo_url')
  ]);

  if (menuData && menuData.data) {
    menuData.data.forEach(m => { if (m.photo_url) _menuItemsMap[m.name] = m.photo_url; });
  }

  _rawData = rows;

  _renderMetrics(rows, rowsPrev);
  _renderChart(rows, from, to);
  _renderPodium(rows);
  _renderTable(rows);
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function _renderMetricsSkeleton() {
  document.getElementById('metricsGrid').innerHTML = `
    ${_metricCardHTML('Total Revenue',   '<div class="skeleton-line" style="height:28px;width:80px;margin-top:4px"></div>', '', 'banknote')}
    ${_metricCardHTML('Jumlah Item',     '<div class="skeleton-line" style="height:28px;width:40px;margin-top:4px"></div>', '', 'shopping-bag')}
    ${_metricCardHTML('Rata-rata Order', '<div class="skeleton-line" style="height:28px;width:60px;margin-top:4px"></div>', '', 'bar-chart-2')}
    ${_metricCardHTML('vs Periode Lalu', '<div class="skeleton-line" style="height:28px;width:50px;margin-top:4px"></div>', '', 'trending-up')}
  `;
}

function _metricCardHTML(label, value, growth, icon) {
  let iconHtml = label === 'Total Revenue' ? `<div class="p-2.5 bg-orange-50 text-brand rounded-2xl"><i data-lucide="${icon}" class="w-5 h-5"></i></div>` : `<div class="p-2.5 bg-gray-50 text-gray-400 border border-gray-100 rounded-2xl"><i data-lucide="${icon}" class="w-5 h-5"></i></div>`;

  return `
    <div class="flex-1 px-6 py-5 flex flex-col justify-center">
      <div class="flex flex-row items-center gap-4">
        ${iconHtml}
        <div class="flex flex-col">
          <div class="text-[13px] text-gray-500 font-bold mb-1">${label}</div>
          <div class="text-xl font-black text-gray-900 tracking-tight leading-none">${value}</div>
        </div>
      </div>
      ${growth ? `<div class="mt-3 text-[11px] font-bold ${growth.cls === 'up' ? 'text-green-600' : growth.cls === 'down' ? 'text-red-600' : 'text-gray-500'} flex items-center gap-1"><i data-lucide="${growth.cls === 'up' ? 'trending-up' : growth.cls === 'down' ? 'trending-down' : 'minus'}" class="w-3 h-3"></i> ${growth.text}</div>` : ''}
    </div>`;
}

function _renderMetrics(rows, rowsPrev) {
  const revenue      = rows.reduce((s, r) => s + r.subtotal, 0);
  const orderSet     = new Set(rows.map(r => r.order_id));
  const uniqueOrders = orderSet.size;
  const itemCount    = rows.reduce((s, r) => s + (r.qty || 0), 0);
  const avg          = uniqueOrders ? revenue / uniqueOrders : 0;

  const revenuePrev = rowsPrev.reduce((s, r) => s + r.subtotal, 0);
  const growth      = revenuePrev === 0
    ? null
    : ((revenue - revenuePrev) / revenuePrev * 100);

  let growthObj = { cls: 'flat', text: '—' };
  if (growth !== null) {
    if (growth > 0)  growthObj = { cls: 'up',   text: `▲ ${growth.toFixed(1)}% vs lalu` };
    else if (growth < 0) growthObj = { cls: 'down', text: `▼ ${Math.abs(growth).toFixed(1)}% vs lalu` };
    else growthObj = { cls: 'flat', text: 'Stabil' };
  }

  document.getElementById('metricsGrid').innerHTML =
    _metricCardHTML('Total Revenue',   formatRupiah(revenue),                  null, 'banknote') +
    _metricCardHTML('Jumlah Item',     `${itemCount}`,                         null, 'shopping-bag') +
    _metricCardHTML('Rata-rata Order', formatRupiah(avg),                      null, 'calculator') +
    _metricCardHTML('vs Periode Lalu', formatRupiah(revenuePrev), growthObj, 'trending-up');
    
  if (window.lucide) window.lucide.createIcons();
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function _renderChart(rows, from, to) {
  // Buat array tanggal dalam range
  const dates = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) { dates.push(_toYmd(cur)); cur.setDate(cur.getDate() + 1); }

  // Sum revenue per hari
  const revenueByDate = {};
  dates.forEach(d => revenueByDate[d] = 0);
  rows.forEach(r => { if (revenueByDate[r.date] !== undefined) revenueByDate[r.date] += r.subtotal; });

  const labels = dates.map(d => {
    const [, m, dd] = d.split('-');
    return `${dd}/${m}`;
  });
  const values = dates.map(d => revenueByDate[d]);

  const ctx = document.getElementById('revenueChart').getContext('2d');
  if (_chartInst) _chartInst.destroy();
  _chartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: values,
        backgroundColor: 'rgba(242, 151, 68, 0.8)', // warna brand aksen (orange)
        hoverBackgroundColor: '#d87c2b', // brand dark
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2937',
          padding: 12,
          titleFont: { size: 13, family: 'Inter, sans-serif' },
          bodyFont: { size: 14, family: 'Inter, sans-serif', weight: 'bold' },
          callbacks: {
            label: ctx => formatRupiah(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => v >= 1000000
              ? `${(v/1000000).toFixed(1)}jt`
              : v >= 1000 ? `${(v/1000).toFixed(0)}rb` : v,
            font: { size: 11, family: 'Inter, sans-serif' },
            color: '#6b7280',
            padding: 8
          },
          grid: { color: '#f3f4f6', drawBorder: false },
          border: { display: false }
        },
        x: { 
          ticks: { font: { size: 11, family: 'Inter, sans-serif' }, color: '#6b7280', padding: 8 }, 
          grid: { display: false },
          border: { display: false }
        }
      }
    }
  });
}

// ─── Podium top-3 ─────────────────────────────────────────────────────────────

function _renderPodium(rows) {
  const wrap = document.getElementById('podiumWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="text-center text-gray-400 py-10 text-sm font-medium">Belum ada data.</div>';
    return;
  }

  // Agregasi per item
  const byItem = {};
  rows.forEach(r => {
    if (!byItem[r.item_name]) byItem[r.item_name] = { qty: 0, revenue: 0 };
    byItem[r.item_name].qty     += r.qty;
    byItem[r.item_name].revenue += r.subtotal;
  });
  const totalRevenue = rows.reduce((s, r) => s + r.subtotal, 0);
  const sorted = Object.entries(byItem)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 3);

  wrap.innerHTML = `<div class="flex flex-col gap-3 w-full">` + sorted.map(([name, d], i) => {
    const pct = totalRevenue ? (d.revenue / totalRevenue * 100).toFixed(1) : '0';
    const imgUrl = _menuItemsMap[name] || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f3f4f6&color=9ca3af&bold=true&size=128`;
    
    return `
      <div class="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors rounded-xl px-2">
        <div class="relative">
          <img src="${imgUrl}" class="w-14 h-14 rounded-2xl object-cover border border-gray-100 shadow-sm" onerror="this.src='https://ui-avatars.com/api/?name=NA&background=f3f4f6&color=9ca3af'" alt="Menu">
          <div class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-xs font-black text-brand">${i+1}</div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-gray-800 text-sm truncate mb-0.5">${_esc(name)}</div>
          <div class="text-[11px] font-semibold text-gray-400 mb-2">${d.qty} Terjual • ${formatRupiah(d.revenue)}</div>
          <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div class="bg-brand h-1.5 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      </div>`;
  }).join('') + `</div>`;
}

// ─── Tabel detail ─────────────────────────────────────────────────────────────

function _renderTable(rows) {
  const wrap = document.getElementById('tableWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="text-center text-gray-400 py-10 text-sm font-medium">Belum ada data pada periode ini.</div>';
    return;
  }

  // Agregasi by order_id agar 1 baris = 1 order
  const ordersMap = {};
  rows.forEach(r => {
    if (!ordersMap[r.order_id]) {
      ordersMap[r.order_id] = {
        order_id: r.order_id,
        order_number: r.order_number,
        date: r.date,
        outlet_name: r.outlet_name,
        items: [],
        qty: 0,
        subtotal: 0
      };
    }
    ordersMap[r.order_id].items.push(`${r.qty}x ${_esc(r.item_name)}`);
    ordersMap[r.order_id].qty += r.qty;
    ordersMap[r.order_id].subtotal += r.subtotal;
  });

  const orderRows = Object.values(ordersMap).map(o => ({
    ...o,
    item_name: o.items.join(', ') // Gabungkan nama item
  }));

  // Sort
  const sorted = [...orderRows].sort((a, b) => {
    let va = a[_sortCol], vb = b[_sortCol];
    if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
    return _sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const colDefs = [
    { key: 'date',         label: 'TANGGAL'    },
    { key: 'order_number', label: 'NO PESANAN' },
    { key: 'outlet_name',  label: 'OUTLET'     },
    { key: 'item_name',   label: 'ITEM'      },
    { key: 'qty',         label: 'QTY TOTAL' },
    { key: 'subtotal',    label: 'SUBTOTAL'  },
  ];

  const thead = colDefs.map(c => {
    const icon = _sortCol === c.key ? (_sortAsc ? '<i data-lucide="chevron-up" class="w-3 h-3 inline"></i>' : '<i data-lucide="chevron-down" class="w-3 h-3 inline"></i>') : '';
    const isNum = c.key === 'qty' || c.key === 'subtotal';
    return `<th onclick="sortTable('${c.key}')" class="px-6 py-4 text-${isNum ? 'right' : 'left'} text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-[#faeadd] transition-colors whitespace-nowrap select-none group border-b border-[#f0dac7]">${c.label} <span class="text-gray-400 group-hover:text-brand transition-colors">${icon}</span></th>`;
  }).join('');

  const tbody = sorted.map(r => {
    const d = new Date(r.date).toLocaleDateString('sv-SE'); // YYYY-MM-DD format as in screenshot
    return `
    <tr class="hover:bg-gray-50/50 transition-colors">
      <td class="px-6 py-4 text-sm text-gray-600 font-medium whitespace-nowrap align-top">${d}</td>
      <td class="px-6 py-4 text-sm text-gray-600 font-medium whitespace-nowrap align-top">${_esc(r.order_number || '-')}</td>
      <td class="px-6 py-4 text-sm text-gray-600 font-medium whitespace-nowrap align-top">${_esc(r.outlet_name)}</td>
      <td class="px-6 py-4 text-sm text-gray-600 font-medium align-top max-w-xs truncate" title="${r.item_name}">${r.item_name}</td>
      <td class="px-6 py-4 text-sm text-gray-600 font-medium text-right align-top">${r.qty}</td>
      <td class="px-6 py-4 text-sm text-gray-600 font-medium text-right whitespace-nowrap align-top">${formatRupiah(r.subtotal)}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="w-full text-left border-collapse">
      <thead class="bg-[#fcf5ef]"><tr>${thead}</tr></thead>
      <tbody class="divide-y divide-gray-100/50">${tbody}</tbody>
    </table>`;
    
  if (window.lucide) window.lucide.createIcons();
}

function sortTable(col) {
  if (_sortCol === col) _sortAsc = !_sortAsc;
  else { _sortCol = col; _sortAsc = false; }
  _renderTable(_rawData);
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

function exportCSV() {
  if (!_rawData.length) { showToast('Tidak ada data untuk diexport.'); return; }

  const { from, to } = _getActiveDates();
  const outletLabel  = _user.role === 'super_admin'
    ? (document.getElementById('outletFilter').selectedOptions[0]?.text || 'semua')
    : (_user.outlet_id || 'outlet');

  const q = s => '"' + String(s).replace(/"/g, '""') + '"';

  // Bagian 1: detail order
  const lines = [
    '# Detail Order',
    'Tanggal,No Pesanan,Outlet,Item,Qty,Subtotal',
    ..._rawData.map(r =>
      `${r.date},${q(r.order_number || '-')},${q(r.outlet_name)},${q(r.item_name)},${r.qty},${r.subtotal}`
    ),
    '',
    '# Ranking Menu',
    'Ranking,Item,Total Dipesan,Revenue',
  ];

  // Bagian 2: ranking menu
  const byItem = {};
  _rawData.forEach(r => {
    if (!byItem[r.item_name]) byItem[r.item_name] = { qty: 0, revenue: 0 };
    byItem[r.item_name].qty     += r.qty;
    byItem[r.item_name].revenue += r.subtotal;
  });
  Object.entries(byItem)
    .sort((a, b) => b[1].qty - a[1].qty)
    .forEach(([name, d], i) => {
      lines.push(`${i + 1},${q(name)},${d.qty},${d.revenue}`);
    });

  const csv  = lines.join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `laporan-${outletLabel.replace(/\s+/g,'-')}-${from}-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export PDF ───────────────────────────────────────────────────────────────

async function exportPDF() {
  if (!_rawData || !_rawData.length) { showToast('Tidak ada data untuk diexport.'); return; }
  showToast('Membuat PDF, harap tunggu...', 'info');

  const { from, to } = _getActiveDates();
  const outletLabel  = _user.role === 'super_admin'
    ? (document.getElementById('outletFilter').selectedOptions[0]?.text || 'Semua Outlet')
    : (_user.outlet_id ? 'Outlet' : 'Semua Outlet');

  // Grouping logic (same as the previous script)
  const summary = {};
  let grandTotalOrders = 0;
  let grandTotalRevenue = 0;

  // Group by order_id first
  const ordersMap = {};
  _rawData.forEach(r => {
    if (!ordersMap[r.order_id]) {
      ordersMap[r.order_id] = {
        order_number: r.order_number,
        date: r.date,
        time: r.time,
        itemsList: [],
        total: 0,
        totalQty: 0
      };
    }
    const sub = r.qty * r.unit_price;
    ordersMap[r.order_id].total += sub;
    ordersMap[r.order_id].totalQty += r.qty;
    ordersMap[r.order_id].itemsList.push({ name: r.item_name, qty: r.qty, price: r.unit_price, sub });
  });

  // Group orders into dates
  Object.values(ordersMap).forEach(o => {
    const d = o.date;
    if (!summary[d]) {
      summary[d] = { count: 0, revenue: 0, items: 0, transactions: [] };
    }
    summary[d].count += 1;
    summary[d].revenue += o.total;
    summary[d].items += o.totalQty;
    summary[d].transactions.push(o);

    grandTotalOrders += 1;
    grandTotalRevenue += o.total;
  });

  const sortedDates = Object.keys(summary).sort();

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    let finalY = 15;
    
    // Helper to check page break
    const checkY = (neededSpace) => {
      if (finalY + neededSpace > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        finalY = 15;
      }
    };

    // Title
    doc.setFontSize(18);
    doc.setTextColor(242, 151, 68); // #f29744
    doc.text("Laporan Rekapitulasi Pesanan", 14, finalY);
    finalY += 8;

    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    doc.text(`Periode: ${from} s/d ${to}`, 14, finalY);
    finalY += 6;
    doc.text(`Outlet: ${outletLabel}`, 14, finalY);
    finalY += 10;

    sortedDates.forEach((d, index) => {
      const s = summary[d];
      const avg = s.count > 0 ? (s.revenue / s.count) : 0;
      
      if (index > 0) finalY += 10;
      checkY(35);
      
      // Date Header
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(242, 151, 68);
      doc.rect(14, finalY, 182, 10, 'F');
      doc.text(`Tanggal: ${d}`, 18, finalY + 7);
      finalY += 15;

      // Date Summary as AutoTable for perfect alignment
      doc.autoTable({
        startY: finalY,
        body: [
          [`Jumlah Pesanan: ${s.count} order`, `Total Item Terjual: ${s.items} porsi`],
          [`Total Pendapatan: ${formatRupiah(s.revenue)}`, `Rata-rata / Transaksi: ${formatRupiah(Math.round(avg))}`]
        ],
        theme: 'plain',
        styles: { fontSize: 10, textColor: [60, 60, 60], cellPadding: 1.5 },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 91 },
          1: { cellWidth: 91 }
        }
      });
      finalY = doc.lastAutoTable.finalY + 8;

      s.transactions.forEach((trx, i) => {
        // Table for each transaction
        doc.autoTable({
          startY: finalY,
          head: [[`Order #${trx.order_number || (i+1)} (Jam: ${trx.time})`, 'Qty', 'Harga Satuan', 'Subtotal']],
          body: trx.itemsList.map(item => [
            item.name,
            item.qty.toString(),
            formatRupiah(item.price),
            formatRupiah(item.sub)
          ]),
          foot: [[`Total Qty: ${trx.totalQty}`, '', 'Total:', formatRupiah(trx.total)]],
          theme: 'grid',
          headStyles: { fillColor: [242, 242, 242], textColor: [40, 40, 40], fontStyle: 'bold' },
          footStyles: { fillColor: [255, 248, 241], textColor: [216, 124, 43], fontStyle: 'bold' },
          styles: { fontSize: 9 },
          columnStyles: {
            1: { halign: 'center', cellWidth: 15 },
            2: { halign: 'right', cellWidth: 35 },
            3: { halign: 'right', cellWidth: 35 }
          },
          margin: { left: 14, right: 14 }
        });
        
        finalY = doc.lastAutoTable.finalY + 12; // Jarak antar order
      });
      
    });

    // Grand Summary
    finalY += 10;
    checkY(40);
    const grandAvg = grandTotalOrders > 0 ? (grandTotalRevenue / grandTotalOrders) : 0;

    doc.autoTable({
      startY: finalY,
      head: [['Ringkasan Keseluruhan', '']],
      body: [
        ['Total Pesanan Keseluruhan', `${grandTotalOrders} order`],
        ['Total Pendapatan Keseluruhan', formatRupiah(grandTotalRevenue)],
        ['Rata-rata Pendapatan Harian', formatRupiah(Math.round(grandTotalRevenue / (sortedDates.length || 1)))],
        ['Rata-rata Nominal Transaksi', formatRupiah(Math.round(grandAvg))]
      ],
      theme: 'grid',
      headStyles: { fillColor: [242, 151, 68], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 11 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right', fontStyle: 'bold', textColor: [216, 124, 43] }
      },
      margin: { left: 14, right: 14 }
    });

    doc.save(`Laporan-Pesanan-${outletLabel.replace(/\s+/g,'-')}-${from}-sd-${to}.pdf`);
    showToast('PDF berhasil didownload!');
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Gagal membuat PDF', 'error');
  }
}

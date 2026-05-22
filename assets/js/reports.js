// assets/js/reports.js — Logic halaman laporan

let _user       = null; // adminUser dari admin.js
let _chartInst  = null; // instance Chart.js
let _rawData    = [];   // rows [{date, outlet_name, item_name, qty, unit_price}]
let _sortCol    = 'date';
let _sortAsc    = false;

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
  return d.toISOString().split('T')[0];
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
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function _fetchRows(from, to, outletId) {
  let q = window.db
    .from('orders')
    .select(`
      id,
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
  (data || []).forEach(order => {
    (order.order_items || []).forEach(item => {
      rows.push({
        order_id:    order.id,
        date:        order.created_at.split('T')[0],
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
  const [rows, rowsPrev] = await Promise.all([
    _fetchRows(from, to, outletId),
    _fetchRows(prev.from, prev.to, outletId),
  ]);

  _rawData = rows;

  _renderMetrics(rows, rowsPrev);
  _renderChart(rows, from, to);
  _renderPodium(rows);
  _renderTable(rows);
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function _renderMetricsSkeleton() {
  document.getElementById('metricsGrid').innerHTML = `
    ${_metricCardHTML('Total Revenue',   '<div class="skeleton skeleton-line" style="height:24px;width:80px;margin:4px 0 2px"></div>', '')}
    ${_metricCardHTML('Jumlah Order',    '<div class="skeleton skeleton-line" style="height:24px;width:40px;margin:4px 0 2px"></div>', '')}
    ${_metricCardHTML('Rata-rata Order', '<div class="skeleton skeleton-line" style="height:24px;width:60px;margin:4px 0 2px"></div>', '')}
    ${_metricCardHTML('vs Periode Lalu', '<div class="skeleton skeleton-line" style="height:24px;width:50px;margin:4px 0 2px"></div>', '')}
  `;
}

function _metricCardHTML(label, value, growth) {
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${growth ? `<div class="metric-growth ${growth.cls}">${growth.text}</div>` : ''}
    </div>`;
}

function _renderMetrics(rows, rowsPrev) {
  const revenue     = rows.reduce((s, r) => s + r.subtotal, 0);
  const orderSet    = new Set(rows.map(r => r.order_id));
  const orderCount  = orderSet.size;
  const avg         = orderCount ? revenue / orderCount : 0;

  const revenuePrev = rowsPrev.reduce((s, r) => s + r.subtotal, 0);
  const growth      = revenuePrev === 0
    ? null
    : ((revenue - revenuePrev) / revenuePrev * 100);

  let growthObj = { cls: 'flat', text: '—' };
  if (growth !== null) {
    if (growth > 0)  growthObj = { cls: 'up',   text: `▲ ${growth.toFixed(1)}% vs periode lalu` };
    else if (growth < 0) growthObj = { cls: 'down', text: `▼ ${Math.abs(growth).toFixed(1)}% vs periode lalu` };
    else growthObj = { cls: 'flat', text: 'Sama dengan periode lalu' };
  }

  document.getElementById('metricsGrid').innerHTML =
    _metricCardHTML('Total Revenue',   formatRupiah(revenue),                  null) +
    _metricCardHTML('Jumlah Order',    `${orderCount} order`,                  null) +
    _metricCardHTML('Rata-rata Order', formatRupiah(avg),                      null) +
    _metricCardHTML('vs Periode Lalu', formatRupiah(revenuePrev), growthObj);
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
        backgroundColor: 'rgba(255,77,79,.75)',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => formatRupiah(ctx.parsed.y)
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => v >= 1000000
              ? `${(v/1000000).toFixed(1)}jt`
              : v >= 1000 ? `${(v/1000).toFixed(0)}rb` : v,
            font: { size: 10 },
          },
          grid: { color: '#eee' }
        },
        x: { ticks: { font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

// ─── Podium top-3 ─────────────────────────────────────────────────────────────

function _renderPodium(rows) {
  const wrap = document.getElementById('podiumWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="report-empty" style="flex:1">Belum ada data.</div>';
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

  const MEDALS = ['🥇','🥈','🥉'];
  wrap.innerHTML = sorted.map(([name, d], i) => {
    const pct = totalRevenue ? (d.revenue / totalRevenue * 100).toFixed(1) : '0';
    return `
      <div class="podium-card ${i === 0 ? 'rank-1' : ''}">
        <div class="podium-rank">${MEDALS[i]}</div>
        <div class="podium-name">${_esc(name)}</div>
        <div class="podium-qty">${d.qty}x</div>
        <div class="podium-sub">${formatRupiah(d.revenue)} (${pct}%)</div>
      </div>`;
  }).join('');
}

// ─── Tabel detail ─────────────────────────────────────────────────────────────

function _renderTable(rows) {
  const wrap = document.getElementById('tableWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="report-empty">Belum ada data pada periode ini.</div>';
    return;
  }

  // Sort
  const sorted = [...rows].sort((a, b) => {
    let va = a[_sortCol], vb = b[_sortCol];
    if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
    return _sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const colDefs = [
    { key: 'date',        label: 'Tanggal'   },
    { key: 'outlet_name', label: 'Outlet'    },
    { key: 'item_name',   label: 'Item'      },
    { key: 'qty',         label: 'Qty'       },
    { key: 'subtotal',    label: 'Subtotal'  },
  ];

  const thead = colDefs.map(c => {
    const icon = _sortCol === c.key ? (_sortAsc ? '▲' : '▼') : '';
    return `<th onclick="sortTable('${c.key}')">${c.label}<span class="sort-icon">${icon}</span></th>`;
  }).join('');

  const tbody = sorted.map(r => `
    <tr>
      <td>${r.date}</td>
      <td style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(r.outlet_name)}</td>
      <td>${_esc(r.item_name)}</td>
      <td style="text-align:right;font-weight:700">${r.qty}</td>
      <td style="text-align:right">${formatRupiah(r.subtotal)}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="report-table">
      <thead><tr>${thead}</tr></thead>
      <tbody>${tbody}</tbody>
    </table>`;
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
    'Tanggal,Outlet,Item,Qty,Subtotal',
    ..._rawData.map(r =>
      `${r.date},${q(r.outlet_name)},${q(r.item_name)},${r.qty},${r.subtotal}`
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

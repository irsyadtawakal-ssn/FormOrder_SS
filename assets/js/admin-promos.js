// admin-promos.js — CRUD promo (super_admin only)
let allPromos = [];
let allMenus = [];

(async function init() {
  const u = await requireAuth();
  if (!u) return;
  if (u.role !== 'super_admin') {
    document.querySelector('.admin-content').innerHTML =
      '<p style="padding:32px;text-align:center;color:var(--muted)">Akses terbatas untuk Super Admin.</p>';
    return;
  }
  await loadMenus();
  await loadPromos();
})();

async function loadMenus() {
  const { data, error } = await window.db
    .from('menu_items')
    .select('id, name, image_url')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (!error) allMenus = data || [];
}


async function loadPromos() {
  const { data, error } = await window.db
    .from('promos')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { showToast('Gagal memuat promo'); return; }
  allPromos = data || [];
  renderPromos();
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function rupiah(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

function promoStatus(p) {
  const now = Date.now();

  // Check is_active first
  if (!p.is_active) return { label: 'Nonaktif', bg: '#f3f4f6', fg: 'var(--muted)' };

  // Check if expired (time-based)
  if (p.end_at && new Date(p.end_at).getTime() < now) {
    return { label: 'Kedaluwarsa', bg: '#f3f4f6', fg: 'var(--muted)' };
  }

  // Check if quota reached (usage-based)
  if (p.usage_limit != null && p.usage_count >= p.usage_limit) {
    return { label: 'Habis', bg: '#fecaca', fg: '#991b1b' };
  }

  // Check if scheduled (not started yet)
  if (p.start_at && new Date(p.start_at).getTime() > now) {
    return { label: 'Terjadwal', bg: '#fef3c7', fg: '#b45309' };
  }

  // Active and valid
  return { label: 'Aktif', bg: '#dcfce7', fg: '#16a34a' };
}

function discountSummary(p) {
  const val = p.discount_type === 'percent' ? `${p.discount_value}%` : rupiah(p.discount_value);
  const parts = [val, `min ${rupiah(p.min_purchase)}`];
  if (p.max_discount != null) parts.push(`maks ${rupiah(p.max_discount)}`);
  
  if (p.applies_to === 'item' && p.item_ids?.length) {
    parts.push(`Hanya ${p.item_ids.length} menu`);
  }
  
  // Add usage display if limit is set
  if (p.usage_limit != null) {
    parts.push(`${p.usage_count ?? 0}/${p.usage_limit} pembeli`);
  }
  return parts.join(' • ');
}

function renderPromos() {
  document.getElementById('summaryBar').textContent =
    `${allPromos.length} promo · ${allPromos.filter(p => promoStatus(p).label === 'Aktif').length} aktif`;
  const tbody = document.getElementById('promoBody');
  if (!allPromos.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="report-empty">Belum ada promo. Klik "Tambah Promo".</td></tr>';
    return;
  }
  tbody.innerHTML = allPromos.map(p => {
    const s = promoStatus(p);
    const badge = `<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${s.bg};color:${s.fg}">${s.label}</span>`;
    return `
      <tr style="cursor:pointer" onclick="openPromoForm('${p.id}')">
        <td><div style="font-weight:700">${escHtml(p.name)}</div></td>
        <td><div style="font-size:12px;color:var(--muted)">${discountSummary(p)}</div></td>
        <td style="text-align:center">${badge}</td>
      </tr>`;
  }).join('');
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openPromoForm(id) {
  const p = id ? allPromos.find(x => x.id === id) : null;
  openModal(`🏷️ ${p ? 'Edit' : 'Tambah'} Promo`, `
    <style>
      .promo-group { margin-bottom: 16px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
      .promo-group-title { font-weight: 700; font-size: 14px; margin-bottom: 12px; color: var(--ink); border-bottom: 1px dashed var(--line); padding-bottom: 8px; }
      .form-row { display: flex; gap: 12px; margin-bottom: 12px; }
      .form-col { flex: 1; min-width: 0; }
      .menu-select-card { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; background: #fff; transition: all 0.2s; user-select: none; }
      .menu-select-card.active { border-color: var(--brand); background: var(--brand-bg); }
      .menu-grid { display: grid; grid-template-columns: 1fr; gap: 8px; max-height: 280px; overflow-y: auto; padding-right: 4px; }
      @media(min-width: 480px) { .menu-grid { grid-template-columns: 1fr 1fr; } }
      .check-icon { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line2); display: flex; align-items: center; justify-content: center; }
      .menu-select-card.active .check-icon { border-color: var(--brand); background: var(--brand); }
      .applies-radio:checked + div { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); color: var(--brand); }
      .applies-radio:not(:checked) + div { background: transparent; box-shadow: none; color: var(--muted); }
    </style>

    <div style="background:#f9fafb; margin:-16px -16px 16px -16px; padding:16px; border-bottom:1px solid var(--line)">
      <label class="form-label">Nama promo</label>
      <input id="pName" class="form-input" style="font-size:16px;font-weight:700" value="${p ? escHtml(p.name) : ''}" placeholder="mis. Diskon Gajian 20%" />
      
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;background:#fff;padding:10px 12px;border-radius:8px;border:1px solid var(--line);width:max-content">
        <input id="pActive" type="checkbox" ${!p || p.is_active ? 'checked':''} style="width:18px;height:18px;accent-color:var(--brand)" /> 
        <span style="font-weight:600;font-size:14px">Promo Aktif</span>
      </label>
    </div>

    <div class="promo-group">
      <div class="promo-group-title">💰 Detail Diskon</div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Tipe diskon</label>
          <select id="pType" class="form-input">
            <option value="percent" ${p && p.discount_type==='percent' ? 'selected':''}>Persen (%)</option>
            <option value="fixed" ${p && p.discount_type==='fixed' ? 'selected':''}>Nominal (Rp)</option>
          </select>
        </div>
        <div class="form-col">
          <label class="form-label">Nilai diskon</label>
          <input id="pValue" type="number" class="form-input" value="${p ? p.discount_value : ''}" placeholder="20" />
        </div>
      </div>
      
      <div class="form-row" style="margin-bottom:0">
        <div class="form-col">
          <label class="form-label">Min. belanja (Rp)</label>
          <input id="pMin" type="number" class="form-input" value="${p ? p.min_purchase : 0}" placeholder="60000" />
        </div>
        <div class="form-col">
          <label class="form-label">Maks. diskon (Rp)</label>
          <input id="pMax" type="number" class="form-input" value="${p && p.max_discount != null ? p.max_discount : ''}" placeholder="Tanpa batas" />
        </div>
      </div>
    </div>

    <div class="promo-group">
      <div class="promo-group-title">🎯 Target & Kuota</div>
      
      <label class="form-label">Berlaku Untuk</label>
      <div style="display:flex;gap:8px;margin-bottom:12px;background:#f3f4f6;padding:4px;border-radius:10px">
        <label style="flex:1;cursor:pointer">
          <input type="radio" name="applies_to" id="appliesAll" value="all" class="applies-radio" style="display:none" ${!p || p.applies_to !== 'item' ? 'checked' : ''} onchange="document.getElementById('pAppliesTo').value='all'; document.getElementById('promoItemsWrapper').style.display='none'" />
          <div style="text-align:center;padding:8px;border-radius:8px;font-weight:600;font-size:13px;transition:all 0.2s">Semua Menu</div>
        </label>
        <label style="flex:1;cursor:pointer">
          <input type="radio" name="applies_to" id="appliesItem" value="item" class="applies-radio" style="display:none" ${p && p.applies_to === 'item' ? 'checked' : ''} onchange="document.getElementById('pAppliesTo').value='item'; document.getElementById('promoItemsWrapper').style.display='grid'" />
          <div style="text-align:center;padding:8px;border-radius:8px;font-weight:600;font-size:13px;transition:all 0.2s">Menu Tertentu</div>
        </label>
      </div>
      <input type="hidden" id="pAppliesTo" value="${p && p.applies_to === 'item' ? 'item' : 'all'}" />

      <div id="promoItemsWrapper" class="menu-grid" style="display:${p && p.applies_to === 'item' ? 'grid' : 'none'}; margin-bottom:16px;">
        ${allMenus.map(m => {
          const isChecked = p && p.item_ids && p.item_ids.includes(m.id);
          return `
            <label class="menu-select-card ${isChecked ? 'active' : ''}">
              <input type="checkbox" class="p-item-check" value="${m.id}" ${isChecked ? 'checked' : ''} style="display:none" onchange="this.parentElement.classList.toggle('active', this.checked); const svg = this.parentElement.querySelector('svg'); if(this.checked) { svg.style.display='block'; } else { svg.style.display='none'; }" />
              <div style="width:40px;height:40px;border-radius:6px;background:#f3f4f6;flex-shrink:0;overflow:hidden;border:1px solid var(--line2)">
                ${m.image_url ? `<img src="${escHtml(m.image_url)}" style="width:100%;height:100%;object-fit:cover" />` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:10px">No Img</div>'}
              </div>
              <div style="font-size:12px;font-weight:600;line-height:1.3;flex:1">${escHtml(m.name)}</div>
              <div class="check-icon">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="display:${isChecked ? 'block' : 'none'}"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </label>
          `;
        }).join('')}
      </div>

      <div class="form-row" style="margin-bottom:0">
        <div class="form-col">
          <label class="form-label">Prioritas</label>
          <input id="pPriority" type="number" class="form-input" value="${p ? p.priority : 1}" />
        </div>
        <div class="form-col">
          <label class="form-label">Batas pembeli</label>
          <input id="pLimit" type="number" class="form-input" value="${p && p.usage_limit != null ? p.usage_limit : ''}" placeholder="Tanpa batas" />
        </div>
      </div>
    </div>

    <div class="promo-group">
      <div class="promo-group-title">📅 Pengaturan Waktu</div>
      <div class="form-row" style="margin-bottom:0">
        <div class="form-col">
          <label class="form-label">Mulai (opsional)</label>
          <input id="pStart" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.start_at) : ''}" />
        </div>
        <div class="form-col">
          <label class="form-label">Selesai (opsional)</label>
          <input id="pEnd" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.end_at) : ''}" />
        </div>
      </div>
    </div>

    ${p && p.usage_limit != null && p.usage_limit > 0 ? `
    <div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:10px;border:1px solid #dcfce7">
      <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:#166534">📊 Status Penggunaan</div>
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;color:#166534">
          <span>${p.usage_count} dari ${p.usage_limit} pembeli</span>
          <span style="font-weight:700">${Math.round((p.usage_count / p.usage_limit) * 100)}%</span>
        </div>
        <div style="width:100%;height:6px;background:#dcfce7;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.min((p.usage_count / p.usage_limit) * 100, 100)}%;background:#16a34a;transition:width 0.3s"></div>
        </div>
      </div>
      ${p.usage_count >= p.usage_limit ? `
        <div style="font-size:12px;color:#991b1b;font-weight:600">Promo ini sudah mencapai batas pembeli.</div>
      ` : `
        <div style="font-size:12px;color:#166534">Berlaku untuk ${p.usage_limit - p.usage_count} pembeli berikutnya.</div>
      `}
    </div>
    ` : ''}

    <div style="display:flex;gap:12px;margin-top:20px">
      ${p ? `<button class="btn" style="flex:1;color:#dc2626;background:#fef2f2;border-color:#fecaca" onclick="deletePromo('${p.id}')">🗑️ Hapus</button>` : ''}
      <button class="btn btn-primary" style="flex:${p ? '2' : '1'};padding:12px;font-size:15px" onclick="savePromo('${p ? p.id : ''}')">💾 Simpan Promo</button>
    </div>
  `);
}

async function savePromo(id) {
  const name = document.getElementById('pName').value.trim();
  const type = document.getElementById('pType').value;
  const value = Number(document.getElementById('pValue').value);
  const min = Number(document.getElementById('pMin').value || 0);
  const maxRaw = document.getElementById('pMax').value;
  const startRaw = document.getElementById('pStart').value;
  const endRaw = document.getElementById('pEnd').value;
  const appliesTo = document.getElementById('pAppliesTo').value;
  
  const itemIds = [];
  if (appliesTo === 'item') {
    document.querySelectorAll('.p-item-check:checked').forEach(cb => itemIds.push(cb.value));
  }

  const priority = Number(document.getElementById('pPriority').value || 1);
  const limitRaw = document.getElementById('pLimit').value;
  const usageLimit = limitRaw === '' ? null : Number(limitRaw);
  const isActive = document.getElementById('pActive').checked;

  if (!name) { showToast('Nama promo wajib diisi'); return; }
  if (appliesTo === 'item' && itemIds.length === 0) { showToast('Pilih setidaknya satu menu'); return; }
  if (!(value > 0)) { showToast('Nilai diskon harus > 0'); return; }
  if (type === 'percent' && value > 100) { showToast('Diskon persen maks 100'); return; }
  if (startRaw && endRaw && new Date(endRaw) <= new Date(startRaw)) {
    showToast('Tanggal selesai harus setelah mulai'); return;
  }

  const payload = {
    name, discount_type: type, discount_value: value, min_purchase: min,
    max_discount: maxRaw === '' ? null : Number(maxRaw),
    start_at: startRaw ? new Date(startRaw).toISOString() : null,
    end_at: endRaw ? new Date(endRaw).toISOString() : null,
    applies_to: appliesTo,
    item_ids: appliesTo === 'item' ? itemIds : null,
    priority, is_active: isActive,
    usage_limit: usageLimit,
    updated_at: new Date().toISOString(),
  };

  const q = id
    ? window.db.from('promos').update(payload).eq('id', id)
    : window.db.from('promos').insert(payload);
  const { error } = await q;
  if (error) { showToast('Gagal menyimpan: ' + error.message); return; }
  showToast('Promo disimpan');
  closeModal();
  await loadPromos();
}

async function deletePromo(id) {
  if (!confirm('Hapus promo ini?')) return;
  const { error } = await window.db.from('promos').delete().eq('id', id);
  if (error) { showToast('Gagal menghapus: ' + error.message); return; }
  showToast('Promo dihapus');
  closeModal();
  await loadPromos();
}

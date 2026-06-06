// admin-promos.js — CRUD promo (super_admin only)
let allPromos = [];

(async function init() {
  const u = await requireAuth();
  if (!u) return;
  if (u.role !== 'super_admin') {
    document.querySelector('.admin-content').innerHTML =
      '<p style="padding:32px;text-align:center;color:var(--muted)">Akses terbatas untuk Super Admin.</p>';
    return;
  }
  await loadPromos();
})();

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
      <label class="form-label">Nama promo</label>
      <input id="pName" class="form-input" value="${p ? escHtml(p.name) : ''}" placeholder="mis. Diskon Gajian 20%" />

      <label class="form-label">Tipe diskon</label>
      <select id="pType" class="form-input">
        <option value="percent" ${p && p.discount_type==='percent' ? 'selected':''}>Persen (%)</option>
        <option value="fixed" ${p && p.discount_type==='fixed' ? 'selected':''}>Nominal (Rp)</option>
      </select>

      <label class="form-label">Nilai diskon</label>
      <input id="pValue" type="number" class="form-input" value="${p ? p.discount_value : ''}" placeholder="20" />

      <label class="form-label">Min. belanja (Rp)</label>
      <input id="pMin" type="number" class="form-input" value="${p ? p.min_purchase : 0}" placeholder="60000" />

      <label class="form-label">Maks. diskon (Rp, opsional)</label>
      <input id="pMax" type="number" class="form-input" value="${p && p.max_discount != null ? p.max_discount : ''}" placeholder="kosong = tanpa batas" />

      <label class="form-label">Mulai (opsional)</label>
      <input id="pStart" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.start_at) : ''}" />

      <label class="form-label">Selesai (opsional)</label>
      <input id="pEnd" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.end_at) : ''}" />

      <label class="form-label">Prioritas</label>
      <input id="pPriority" type="number" class="form-input" value="${p ? p.priority : 1}" />

      <label class="form-label">Batas pembeli (opsional)</label>
      <input id="pLimit" type="number" class="form-input" value="${p && p.usage_limit != null ? p.usage_limit : ''}" placeholder="kosong = unlimited" />

      <label style="display:flex;align-items:center;gap:8px;margin-top:12px">
        <input id="pActive" type="checkbox" ${!p || p.is_active ? 'checked':''} /> Aktif
      </label>

      ${p && p.usage_limit != null && p.usage_limit > 0 ? `
      <div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #dcfce7">
        <div style="font-weight:700;font-size:12px;margin-bottom:8px">📊 Status Penggunaan</div>
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span>${p.usage_count} dari ${p.usage_limit} pembeli</span>
            <span style="color:var(--muted)">${Math.round((p.usage_count / p.usage_limit) * 100)}%</span>
          </div>
          <div style="width:100%;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.min((p.usage_count / p.usage_limit) * 100, 100)}%;background:#16a34a;transition:width 0.3s"></div>
          </div>
        </div>
        ${p.usage_count >= p.usage_limit ? `
          <div style="font-size:12px;color:#991b1b">Promo ini sudah mencapai batas pembeli. Tidak ada pembeli baru yang bisa dapat diskon.</div>
        ` : `
          <div style="font-size:12px;color:#166534">Promo ini masih berlaku untuk ${p.usage_limit - p.usage_count} pembeli berikutnya.</div>
        `}
      </div>
      ` : ''}

      <button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="savePromo('${p ? p.id : ''}')">💾 Simpan</button>
      ${p ? `<button class="btn" style="width:100%;margin-top:8px;color:#dc2626" onclick="deletePromo('${p.id}')">🗑️ Hapus</button>` : ''}
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
  const priority = Number(document.getElementById('pPriority').value || 1);
  const limitRaw = document.getElementById('pLimit').value;
  const usageLimit = limitRaw === '' ? null : Number(limitRaw);
  const isActive = document.getElementById('pActive').checked;

  if (!name) { showToast('Nama promo wajib diisi'); return; }
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

# Promo Usage Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add usage quota + datetime picker to promo system, auto-disable promos when quota reached or time expired, enable admin manual override.

**Architecture:** 
- DB migration adds `usage_limit` and `usage_count` columns to promos table
- Admin form changes date inputs → datetime-local, adds "Batas pembeli" field
- Edge Functions modified: `create-xendit-payment` checks quota, `xendit-webhook` increments counter + auto-off
- New Edge Function `auto-disable-expired-promos` runs hourly via pg_cron
- Admin UI enhanced: tabel shows usage ratio, badge shows status (Active/Habis/Kedaluwarsa/Nonaktif), modal shows progress bar

**Tech Stack:** Supabase (PostgreSQL + pg_cron + Edge Functions/Deno), Vanilla JS

---

## File Structure

**Files to Create:**
- `supabase/migrations/20260606_promo_usage_limit.sql` — migration for new columns + FK + cron
- `supabase/functions/auto-disable-expired-promos/index.ts` — new Edge Function

**Files to Modify:**
- `admin/promos.html` — add datetime inputs + usage limit field + status badge logic
- `assets/js/admin-promos.js` — form logic, display logic for usage progress
- `supabase/functions/create-xendit-payment/index.ts` — add usage limit check (3 lines)
- `supabase/functions/xendit-webhook/index.ts` — add increment + auto-off logic (8 lines)

---

## Tasks

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260606_promo_usage_limit.sql`

- [ ] **Step 1: Create migration file with usage columns**

```sql
-- Add usage limit tracking columns
ALTER TABLE public.promos
  ADD COLUMN IF NOT EXISTS usage_limit integer,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.promos.usage_limit IS 'Maximum number of buyers who can use this promo. NULL = unlimited.';
COMMENT ON COLUMN public.promos.usage_count IS 'Current count of buyers who have used this promo (incremented on payment confirmation).';

-- Update existing FK constraint to allow deletion
ALTER TABLE public.orders
  DROP CONSTRAINT IF NOT EXISTS orders_promo_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_promo_id_fkey
    FOREIGN KEY (promo_id)
    REFERENCES public.promos(id)
    ON DELETE SET NULL;

-- Schedule cron job for auto-disabling expired promos
-- Run every hour at :00 minutes
SELECT cron.schedule(
  'auto-disable-expired-promos',
  '0 * * * *',
  $$
  UPDATE public.promos
  SET is_active = false
  WHERE is_active = true AND end_at < now();
  $$
);
```

- [ ] **Step 2: Run migration in Supabase SQL Editor (production)**

- Copy paste entire file content
- Click "Run"
- Verify: No errors, table structure shows `usage_limit` and `usage_count` columns

- [ ] **Step 3: Commit migration file**

```bash
cd "D:\MIT\CLAUDE CODE PROJECT\TiktokGo SS"
git add supabase/migrations/20260606_promo_usage_limit.sql
git commit -m "Migration: add usage_limit and usage_count to promos table + auto-disable cron"
```

---

### Task 2: Admin Form — Datetime Inputs

**Files:**
- Modify: `admin/promos.html` (lines ~98-101)
- Modify: `assets/js/admin-promos.js` (lines ~69-74)

- [ ] **Step 1: Change date inputs to datetime-local in form**

In `admin/promos.html`, find:
```html
<label class="form-label">Mulai (opsional)</label>
<input id="pStart" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.start_at) : ''}" />

<label class="form-label">Selesai (opsional)</label>
<input id="pEnd" type="datetime-local" class="form-input" value="${p ? toLocalInput(p.end_at) : ''}" />
```

Verify they already say `type="datetime-local"` — **no change needed**. If they say `type="date"`, change them now.

- [ ] **Step 2: Verify toLocalInput() function handles datetime correctly**

In `assets/js/admin-promos.js`, find function (around line 69):
```js
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

This already supports datetime (with hours/minutes). **No change needed.**

- [ ] **Step 3: Test datetime input locally**

- Open `http://localhost:7789/admin/promos.html` (or production)
- Click "+ Tambah Promo"
- Field "Mulai" should allow selecting date AND time
- Field "Selesai" should allow selecting date AND time
- Test: set "Mulai: 6 Juni 2026, 13:00" and "Selesai: 7 Juni 2026, 22:00"
- Click "💾 Simpan"
- Verify: no errors

- [ ] **Step 4: Commit (no code changes, verification only)**

```bash
# Dates already support datetime-local, no changes needed
git status
# Should show no changes, or minimal changes if you removed type="date"
```

---

### Task 3: Admin Form — Usage Limit Input

**Files:**
- Modify: `admin/promos.html` (in modal form, add new input after priority)
- Modify: `assets/js/admin-promos.js` (in savePromo, extract & save value)

- [ ] **Step 1: Add "Batas pembeli" input to form in promos.html**

In `openPromoForm()` function inside `admin/promos.html`, find the line with `pPriority` input (around line 104):

```html
<label class="form-label">Prioritas</label>
<input id="pPriority" type="number" class="form-input" value="${p ? p.priority : 1}" />
```

After this, add:
```html
<label class="form-label">Batas pembeli (opsional)</label>
<input id="pLimit" type="number" class="form-input" value="${p && p.usage_limit != null ? p.usage_limit : ''}" placeholder="kosong = unlimited" />
```

- [ ] **Step 2: Extract usage_limit in savePromo() function**

In `assets/js/admin-promos.js`, find `savePromo()` function (around line 115):

After line:
```js
const priority = Number(document.getElementById('pPriority').value || 1);
```

Add:
```js
const limitRaw = document.getElementById('pLimit').value;
const usageLimit = limitRaw === '' ? null : Number(limitRaw);
```

- [ ] **Step 3: Add usage_limit to payload**

In same function, find `const payload = {` (around line 133):

Update the payload object to include:
```js
const payload = {
  name, discount_type: type, discount_value: value, min_purchase: min,
  max_discount: maxRaw === '' ? null : Number(maxRaw),
  start_at: startRaw ? new Date(startRaw).toISOString() : null,
  end_at: endRaw ? new Date(endRaw).toISOString() : null,
  priority, is_active: isActive, 
  usage_limit: usageLimit,  // ADD THIS LINE
  updated_at: new Date().toISOString(),
};
```

- [ ] **Step 4: Test form with usage limit**

- Open admin promo page
- Click "+ Tambah Promo"
- Fill form:
  - Nama: "Test Limit 3"
  - Type: Persen
  - Value: 20
  - Min: 60000
  - Prioritas: 1
  - **Batas pembeli: 3**
- Click "💾 Simpan"
- Verify: no errors, promo appears in table

- [ ] **Step 5: Commit**

```bash
git add admin/promos.html assets/js/admin-promos.js
git commit -m "Admin: add 'Batas pembeli' input to promo form"
```

---

### Task 4: Admin Table — Display Usage & Badge Colors

**Files:**
- Modify: `assets/js/admin-promos.js` (functions: `discountSummary`, `promoStatus`)

- [ ] **Step 1: Update discountSummary() to show usage**

In `assets/js/admin-promos.js`, find function `discountSummary()` (around line 42):

Replace entire function:
```js
function discountSummary(p) {
  const val = p.discount_type === 'percent' ? `${p.discount_value}%` : rupiah(p.discount_value);
  const parts = [val, `min ${rupiah(p.min_purchase)}`];
  if (p.max_discount != null) parts.push(`maks ${rupiah(p.max_discount)}`);
  // Add usage display if limit is set
  if (p.usage_limit != null) {
    parts.push(`${p.usage_count}/${p.usage_limit} pembeli`);
  }
  return parts.join(' • ');
}
```

- [ ] **Step 2: Update promoStatus() to include usage state**

In `assets/js/admin-promos.js`, find function `promoStatus()` (around line 32):

Replace entire function:
```js
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
```

- [ ] **Step 3: Test badge colors**

- Open admin promo page, create test promos:
  - Promo A: limit=5, usage=2 → should show "Aktif" (green)
  - Promo B: limit=5, usage=5 → should show "Habis" (red)
  - Promo C: is_active=false → should show "Nonaktif" (gray)
  - Promo D: end_at < now → should show "Kedaluwarsa" (gray)
- Verify colors match spec

- [ ] **Step 4: Commit**

```bash
git add assets/js/admin-promos.js
git commit -m "Admin: show usage count in table + update badge colors for auto-off states"
```

---

### Task 5: Admin Modal — Status Penggunaan Section

**Files:**
- Modify: `assets/js/admin-promos.js` (function: `openPromoForm`)

- [ ] **Step 1: Add Status Penggunaan section to form**

In `openPromoForm()` function in `admin/promos.js`, find the form HTML (around line 78).

Before the `💾 Simpan` button, add this section:

```html
${p && p.usage_limit != null ? `
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
```

Place this right before the `💾 Simpan` button line.

- [ ] **Step 2: Test modal with usage display**

- Open admin promo page
- Click promo that has usage_limit set
- Should see "📊 Status Penggunaan" section with:
  - Progress bar filled based on usage_count/usage_limit
  - Percentage display
  - Message about remaining buyers (or "habis" if quota reached)
- Verify layout is clean, colors match design

- [ ] **Step 3: Commit**

```bash
git add assets/js/admin-promos.js
git commit -m "Admin: add Status Penggunaan section to promo detail modal"
```

---

### Task 6: create-xendit-payment — Usage Limit Check

**Files:**
- Modify: `supabase/functions/create-xendit-payment/index.ts` (around line 80-90, after promo lookup)

- [ ] **Step 1: Add usage limit check before discount calculation**

In `create-xendit-payment/index.ts`, find the section where promo is applied (around line 80-90):

```ts
const promo = promoRows?.[0];
if (promo) {
  // ADD CHECK HERE
  if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
    // Quota reached, do not apply discount
    discount = 0;
    promoId = null;
    promoName = null;
  } else {
    // Calculate discount (existing code)
    if (promo.discount_type === 'percent') {
      discount = Math.round(subtotal * Number(promo.discount_value) / 100);
      // ... rest of discount calc
```

Complete code block:
```ts
const promo = promoRows?.[0];
if (promo) {
  if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
    // Usage limit reached, skip discount
    discount = 0;
    promoId = null;
    promoName = null;
  } else {
    // Hitung diskon normal
    if (promo.discount_type === 'percent') {
      discount = Math.round(subtotal * Number(promo.discount_value) / 100);
      if (promo.max_discount != null) {
        discount = Math.min(discount, Number(promo.max_discount));
      }
    } else {
      discount = Math.min(Number(promo.discount_value), subtotal);
    }
    discount = Math.max(0, discount);
    promoId = promo.id;
    promoName = promo.name;
  }
}
```

- [ ] **Step 2: Test locally**

- Create promo "Test Limit 1" with usage_limit=1, usage_count=0
- Order with subtotal 65000 → should apply diskon 20%
- Check order in DB → discount=13000, promo_id set
- Manually increment usage_count to 1 in DB
- Create another order with same promo → discount should be 0, promo_id should be null

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-xendit-payment/index.ts
git commit -m "Edge Function: add usage limit check in create-xendit-payment"
```

---

### Task 7: xendit-webhook — Increment Counter & Auto-Off

**Files:**
- Modify: `supabase/functions/xendit-webhook/index.ts` (around line 100-120, after order status updated to paid)

- [ ] **Step 1: Add increment logic after payment confirmation**

In `xendit-webhook/index.ts`, find where order status is updated to `paid` (around line 100-120).

After the status update, add:

```ts
// Increment promo usage count if promo was used
if (order.promo_id) {
  const { data: updatedPromo } = await supabase
    .from('promos')
    .update({ usage_count: order.promo_usage_count + 1 })
    .eq('id', order.promo_id)
    .select('usage_count, usage_limit')
    .single();

  // Auto-off promo if quota reached
  if (
    updatedPromo &&
    updatedPromo.usage_limit &&
    updatedPromo.usage_count >= updatedPromo.usage_limit
  ) {
    await supabase
      .from('promos')
      .update({ is_active: false })
      .eq('id', order.promo_id);
  }
}
```

Add this code right after the order status is set to 'paid'.

- [ ] **Step 2: Test webhook increment logic**

- Create order with promo (limit=2, count=1)
- Simulate payment (manual DB update: order.status='paid' or use Xendit test payment)
- Check promo table: usage_count should be 2
- Create another order with same promo
- Simulate payment
- Check promo table: usage_count=3, is_active should be false (auto-disabled)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/xendit-webhook/index.ts
git commit -m "Edge Function: increment promo usage_count on payment + auto-disable when quota reached"
```

---

### Task 8: auto-disable-expired-promos — New Edge Function

**Files:**
- Create: `supabase/functions/auto-disable-expired-promos/index.ts`

- [ ] **Step 1: Create new Edge Function directory and index.ts**

```bash
mkdir -p supabase/functions/auto-disable-expired-promos
```

- [ ] **Step 2: Write Edge Function**

Create `supabase/functions/auto-disable-expired-promos/index.ts`:

```ts
// supabase/functions/auto-disable-expired-promos/index.ts
// Triggered by pg_cron every hour
// Disables promos where end_at < now

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  try {
    // Only allow POST requests (triggered by cron)
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const now = new Date().toISOString();

    // Find and disable expired promos
    const { data: expiredPromos, error: selectError } = await supabase
      .from('promos')
      .select('id, name')
      .eq('is_active', true)
      .lt('end_at', now)
      .not('end_at', 'is', null);

    if (selectError) {
      throw selectError;
    }

    if (!expiredPromos || expiredPromos.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No expired promos found', disabled: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Disable each expired promo
    const { error: updateError } = await supabase
      .from('promos')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('end_at', now)
      .not('end_at', 'is', null);

    if (updateError) {
      throw updateError;
    }

    console.log(`Auto-disabled ${expiredPromos.length} expired promos`);

    return new Response(
      JSON.stringify({
        message: `Auto-disabled ${expiredPromos.length} expired promos`,
        disabled: expiredPromos.length,
        promos: expiredPromos.map((p: any) => p.name),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error in auto-disable-expired-promos:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

- [ ] **Step 3: Deploy Edge Function**

```bash
cd "D:\MIT\CLAUDE CODE PROJECT\TiktokGo SS"
supabase functions deploy auto-disable-expired-promos
```

Expected output: "Function deployed successfully"

- [ ] **Step 4: Test function manually**

```bash
# Invoke function to test (should find any expired promos)
supabase functions invoke auto-disable-expired-promos --no-verify
```

Should return: `{"message":"No expired promos found","disabled":0}` or similar

- [ ] **Step 5: Verify cron is scheduled**

The migration in Task 1 already scheduled the cron job via SQL. Verify by checking Supabase:
- Dashboard → Edge Functions → Background Jobs
- Or query: `SELECT * FROM cron.job WHERE jobname = 'auto-disable-expired-promos';`

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/auto-disable-expired-promos/
git commit -m "Edge Function: add auto-disable-expired-promos with cron schedule"
```

---

### Task 9: E2E Testing

**Files:**
- Test against production/local Supabase instance

- [ ] **Step 1: Test scenario — Quota Reached**

1. Create promo "Test Quota" with:
   - Discount: 20%
   - Min: 50000
   - Usage limit: 2
2. Order 1: subtotal 60000 → apply diskon 12000 → total 48000 + fee
3. Confirm payment → usage_count becomes 1, is_active still true
4. Order 2: subtotal 55000 → apply diskon 11000 → total 44000 + fee
5. Confirm payment → usage_count becomes 2, is_active becomes FALSE (auto-off)
6. Order 3: subtotal 70000 → NO diskon applied (quota exhausted) → total 70000 + fee
7. Verify order 3 does not have promo_id

- [ ] **Step 2: Test scenario — Time Expired**

1. Create promo "Test Expiry" with:
   - Start: now
   - End: 1 hour from now (or set past time for immediate test)
   - Usage limit: null (unlimited)
2. Place order → diskon applied
3. Wait 1 hour (or manually set end_at to past in DB)
4. Cron job runs (every hour at :00) → is_active becomes FALSE
5. New order → diskon NOT applied (promo expired)

- [ ] **Step 3: Test scenario — Manual Override**

1. Create promo "Test Override" with limit=1
2. Order → usage_count=1, is_active auto-disabled
3. Admin opens promo in edit modal → sees "Habis" badge
4. Admin clicks "Aktif" checkbox to enable → is_active becomes TRUE
5. New order → diskon IS applied again
6. Verify: admin can override auto-off

- [ ] **Step 4: Test scenario — Datetime Picker**

1. Create promo with:
   - Mulai: 6 Juni 2026, 13:00 (afternoon)
   - Selesai: 7 Juni 2026, 22:00 (next day evening)
2. Order at 12:59 → diskon NOT applied (before start time)
3. Order at 13:00 → diskon IS applied
4. Order at 23:00 (after end time) → diskon NOT applied
5. Verify datetime logic works correctly

- [ ] **Step 5: Log all test results**

Create a test summary document or take screenshots:
- Promo list showing usage counts
- Badge colors (Aktif/Habis/Kedaluwarsa/Nonaktif)
- Modal with Status Penggunaan progress bar
- Orders with and without diskon applied correctly

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "Test: e2e verification of promo usage limit feature"
```

---

## Spec Coverage Self-Review

✅ **Data Model** — Task 1 (migration adds usage_limit/usage_count, FK update, cron schedule)
✅ **Admin UI — Form** — Task 3 (datetime inputs already present, add usage_limit input)
✅ **Admin UI — Table** — Task 4 (display usage in "Syarat", update badge logic)
✅ **Admin UI — Modal** — Task 5 (Status Penggunaan section with progress bar)
✅ **Backend — create-xendit-payment** — Task 6 (usage limit check before discount)
✅ **Backend — xendit-webhook** — Task 7 (increment + auto-off)
✅ **Backend — auto-disable-expired-promos** — Task 8 (new Edge Function + cron)
✅ **E2E Testing** — Task 9 (all scenarios covered)

No gaps identified. All spec requirements have corresponding tasks.

---

## Plan Summary

- **Total Tasks:** 9
- **Estimated Time:** 2-3 hours (backend + admin UI + testing)
- **Key Commits:** 6 commits (migration, form, table, modal, edge functions, tests)
- **Files Modified:** 4 files
- **Files Created:** 2 files

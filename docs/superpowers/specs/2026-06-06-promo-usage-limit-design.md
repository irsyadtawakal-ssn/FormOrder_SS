# Promo Usage Limit Feature — Design Spec

**Date:** 2026-06-06  
**Status:** Design Approved  
**Scope:** Add usage quota + datetime support to existing promo system  

---

## Overview

Extend promo system (Phase 14) with usage limit feature:
- Limit promo to N first buyers (e.g., "Diskon Gajian 20%" applies to 5 buyers only)
- After quota reached, promo auto-disables (but admin can manually re-enable)
- Add datetime picker to promo period (currently only date)
- Auto-disable expired promos via scheduled cron job

**MVP Scope:**
- ✅ Usage limit (permanent, no reset)
- ✅ Datetime picker (start_at / end_at with hours)
- ✅ Auto-off behavior (quota reached + time expired)
- ✅ Manual override (admin can toggle is_active anytime)
- ✅ Badge in admin UI (show usage count)
- ✅ Increment counter only at payment confirmation

---

## Data Model

### Promos Table (New Columns)

```sql
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS
  usage_limit     integer,           -- max buyers who can use this promo (null = unlimited)
  usage_count     integer DEFAULT 0; -- current count of buyers who used this promo
```

### Existing Columns (Behavior Changes)

**`start_at` / `end_at`:** Already exist as `timestamptz`. No schema change needed.
- Current: Can only set date (e.g., "2026-06-06")
- New: Will support datetime in admin UI (e.g., "2026-06-06 13:00")
- Database stores full timestamp, UI just changes input type

### Orders Table (No Changes)

Existing columns `discount`, `promo_id`, `promo_name` are sufficient to track which promo was applied.

---

## Admin UI Changes

### Promo Form (`admin/promos.html`)

**Existing inputs (refactored):**
- "Mulai (opsional)" → change `type="date"` to `type="datetime-local"`
- "Selesai (opsional)" → change `type="date"` to `type="datetime-local"`
- Parse/format using `toLocalInput()` and `new Date().toISOString()` (already in `admin-promos.js`)

**New input:**
- Label: "Batas pembeli (opsional)"
- Type: `<input type="number">`
- Placeholder: "kosong = unlimited"
- Field name: `max_buyers` (maps to `usage_limit` in DB)

### Promo Table Display

**Column "Syarat" (existing):**
- Current: "20% • min Rp 60.000"
- **New:** "20% • min Rp 60.000 • 5/5 pembeli" (if usage_limit set)
- If usage_limit null: unchanged

**Status badge (existing, enhanced):**
- Color logic:
  - ✅ Green "Aktif" — `is_active = true` AND not expired AND usage < limit
  - 🟠 Orange "Habis" — `is_active = true` BUT usage >= limit
  - 🔴 Red "Kedaluwarsa" — `is_active = true` BUT end_at < now
  - ⚪ Gray "Nonaktif" — `is_active = false` (manual toggle)

### Modal Detail (Edit Form)

When admin clicks promo to edit, if `usage_limit` is set:

**New section: "📊 Status Penggunaan"**
```
Progress bar: [████████░░] 5 dari 5 pembeli
Text: "Promo ini sudah mencapai batas pembeli. Tidak ada pembeli baru yang bisa dapat diskon."
```

If usage < limit:
```
Progress bar: [██░░░░░░░░] 2 dari 5 pembeli
Text: "Promo ini masih berlaku untuk 3 pembeli berikutnya."
```

If no usage limit:
```
(Section tidak ditampilkan)
```

**Checkbox "Aktif" (existing):**
- Admin dapat toggle kapan saja
- Even if auto-disabled, can manually re-enable

---

## Backend Logic

### A. Order Creation (`create-xendit-payment` Edge Function)

**After promo lookup, before discount calculation:**

```ts
let discount = 0;
let promoId: string | null = null;
let promoName: string | null = null;

const nowIso = new Date().toISOString();
const { data: promoRows } = await supabase
  .from('promos')
  .select('id, name, discount_type, discount_value, max_discount, min_purchase, usage_limit, usage_count')
  .eq('is_active', true)
  .eq('applies_to', 'all')
  .lte('min_purchase', subtotal)
  .or(`start_at.is.null,start_at.lte."${nowIso}"`)
  .or(`end_at.is.null,end_at.gte."${nowIso}"`)
  .order('priority', { ascending: false })
  .order('discount_value', { ascending: false })
  .limit(1);

const promo = promoRows?.[0];
if (promo) {
  // CHECK USAGE LIMIT
  if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
    // Quota reached, do not apply discount
    discount = 0;
    promoId = null;
    promoName = null;
  } else {
    // Calculate discount
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

const afterDiscount = subtotal - discount;
const serviceFee = Math.ceil(afterDiscount * feePct);
const total = afterDiscount + serviceFee;
```

### B. Payment Confirmation (`xendit-webhook` Edge Function)

**After order status updated to `paid`:**

```ts
if (order.status === 'paid' && order.promo_id) {
  // Increment usage count
  const { data: updatedPromo } = await supabase
    .from('promos')
    .update({ usage_count: order.promoUsageCount + 1 })
    .eq('id', order.promo_id)
    .select('usage_count, usage_limit')
    .single();

  // AUTO-OFF if quota reached
  if (
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

### C. Scheduled Promo Expiry (`auto-disable-expired-promos` Edge Function)

**New Edge Function** (similar to `auto-cancel-expired-orders`)

**Schedule:** pg_cron every 1 hour

```ts
// Scan for expired promos still marked active
const { data: expiredPromos } = await supabase
  .from('promos')
  .select('id')
  .eq('is_active', true)
  .lt('end_at', new Date().toISOString())
  .not('end_at', 'is', null);

for (const promo of expiredPromos) {
  await supabase
    .from('promos')
    .update({ is_active: false })
    .eq('id', promo.id);
}
```

**Migration to add cron:**
```sql
-- Schedule auto-disable-expired-promos every 1 hour
SELECT cron.schedule(
  'auto-disable-expired-promos',
  '0 * * * *', -- every hour at :00
  $$
  UPDATE public.promos
  SET is_active = false
  WHERE is_active = true AND end_at < now();
  $$
);
```

---

## Error Handling

### Race Condition (Concurrent Orders)

**Scenario:**
- Promo limit = 5, usage_count = 4
- Buyers A and B order simultaneously
- Both pass the `usage_count < usage_limit` check
- A pays first → usage_count becomes 5
- B pays second → usage_count becomes 6 (exceeds limit)

**Solution:** This is acceptable behavior. Counter can briefly exceed limit due to race condition, but promo is disabled on first violation. Next order will not apply this promo.

**Alternative (if strict enforcement needed):** Use database row-level locking via SQL `SELECT ... FOR UPDATE`, but adds complexity. Not required for MVP.

### Promo Deleted After Order Created

**Scenario:**
- Order A references promo_id = ABC
- Admin deletes promo ABC
- Payment confirmation tries to increment non-existent promo

**Solution:** Foreign key constraint `ON DELETE SET NULL` ensures order.promo_id becomes null, discount remains in order.discount (historical record).

### Admin Changes Usage Limit Mid-Stream

**Scenario:**
- Promo usage_limit = 5, usage_count = 5 (auto-disabled)
- Admin manually increases usage_limit to 10
- Next buyer can now get discount again

**Behavior:** Acceptable — admin has manual control. No automatic re-enabling needed.

### Buyer Cancels Payment

**Scenario:**
- Order created, buyer cancels before payment
- usage_count not incremented (counter only rises on `paid` status)

**Behavior:** Correct — counter not affected, quota still available for next buyer.

---

## Migration SQL

```sql
-- Add usage limit columns to promos
ALTER TABLE public.promos
  ADD COLUMN IF NOT EXISTS usage_limit integer,
  ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;

-- Ensure foreign key on orders.promo_id allows SET NULL
ALTER TABLE public.orders
  DROP CONSTRAINT IF NOT EXISTS orders_promo_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_promo_id_fkey
    FOREIGN KEY (promo_id)
    REFERENCES public.promos(id)
    ON DELETE SET NULL;

-- Schedule cron job for auto-disable-expired-promos
-- (Edge Function handles the actual query)
-- See: supabase/functions/auto-disable-expired-promos/index.ts
```

---

## Implementation Checklist

### Backend
- [ ] Migration: add `usage_limit`, `usage_count` columns
- [ ] Migration: update FK constraint with `ON DELETE SET NULL`
- [ ] Migration: add pg_cron schedule for auto-disable
- [ ] Edge Function: `create-xendit-payment` — add usage limit check
- [ ] Edge Function: `xendit-webhook` — add increment + auto-off logic
- [ ] Edge Function: `auto-disable-expired-promos` — new function for cron

### Admin Frontend
- [ ] Form: change `start_at` input type to `datetime-local`
- [ ] Form: change `end_at` input type to `datetime-local`
- [ ] Form: add "Batas pembeli" number input
- [ ] Table: update "Syarat" column to show usage (e.g., "5/5 pembeli")
- [ ] Table: update badge logic (auto-off color states)
- [ ] Modal: add "Status Penggunaan" section with progress bar
- [ ] Test: admin can manually toggle `is_active` override

### Testing
- [ ] E2E: order with usage_limit < 5 → diskon applied
- [ ] E2E: order with usage_limit = 5 → 5th buyer gets diskon, auto-off
- [ ] E2E: order with usage_limit = 5 (after off) → 6th buyer no diskon
- [ ] E2E: promo with end_at < now → auto-disabled by cron
- [ ] E2E: admin manually re-enable after auto-off → diskon applies again
- [ ] E2E: datetime picker works correctly (set jam 13:00, verify stored)

---

## Out of Scope (Roadmap)

- Per-customer limit (e.g., "max 1 promo per customer")
- Promo code / coupon system (currently auto-apply based on conditions)
- Stacking multiple promos (currently only highest-value applies)
- Tiered discounts (e.g., buy 2+ get higher discount)

---

## Success Criteria

✅ Promo with `usage_limit = 5` applies only to first 5 buyers  
✅ After quota reached, promo auto-disables (is_active = false)  
✅ Admin can manually toggle is_active anytime  
✅ Promo with end_at < now auto-disables via cron  
✅ Admin UI shows usage progress (e.g., "5/5 pembeli") with color indicator  
✅ Datetime picker allows setting hours (not just date)  
✅ No race condition edge cases affect order confirmation  

---

## References

- Promo system spec: `docs/superpowers/specs/2026-06-05-promo-system-design.md`
- Plans: `Plans.md` (Phase 14)
- Related: auto-cancel-expired-orders (similar cron pattern)

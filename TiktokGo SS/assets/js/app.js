// SUKA Shawarma — app.js
// Logika checkout, pemanggilan Edge Functions, payment redirect

const SERVICE_FEE_RATE = 0.007; // default display; nilai final dari server

// ─── Panggil Edge Function via Supabase SDK ───────────────────────────────────
// Menggunakan window.db.functions.invoke agar auth header otomatis terpasang

async function callEdgeFunction(name, body) {
  const { data, error } = await window.db.functions.invoke(name, { body });
  if (error) {
    // Supabase membungkus HTTP error dalam FunctionsHttpError
    let msg = error.message || 'Edge Function error';
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch { /* abaikan parse error */ }
    throw new Error(msg);
  }
  if (data && !data.success && data.error) throw new Error(data.error);
  return data;
}

// ─── Submit checkout — panggil create-tripay-payment ──────────────────────────
// checkoutData: { outletSlug, cart, customerName, customerWA, pickupTime, notes }
// Mengembalikan: { order_number, order_id, qris_url, pay_url, expires_at, total, subtotal, service_fee }

async function submitCheckout(checkoutData) {
  const { outletSlug, cart, customerName, customerWA, pickupTime, notes } = checkoutData;

  const items = cart.map(item => ({
    menu_item_id: item.menuItemId,
    quantity:     item.qty,
    option_ids:   Array.isArray(item.optionIds) ? item.optionIds : [],
    selections:   item.selections || {},
    note:         item.note || null,
  }));

  return await callEdgeFunction('create-tripay-payment', {
    outlet_slug:   outletSlug,
    items,
    customer_name: customerName,
    customer_wa:   customerWA,
    pickup_time:   pickupTime,
    notes:         notes || null,
  });
}

// ─── Submit manual order — tanpa payment gateway ─────────────────────────────
// Mengembalikan: { order_number, order_id, total, subtotal, service_fee }

async function submitManualOrder(checkoutData) {
  const { outletSlug, cart, customerName, customerWA, pickupTime, notes } = checkoutData;

  const items = cart.map(item => ({
    menu_item_id: item.menuItemId,
    qty:          item.qty,
    option_ids:   Array.isArray(item.optionIds) ? item.optionIds : [],
    selections:   item.selections || {},
    note:         item.note || null,
  }));

  return await callEdgeFunction('create-manual-order', {
    outlet_slug:   outletSlug,
    items,
    customer_name: customerName,
    customer_wa:   customerWA,
    pickup_time:   pickupTime,
    notes:         notes || null,
  });
}

// ─── Cek status order — panggil check-tripay-status ──────────────────────────
// Mengembalikan: { success, status, synced }

async function checkOrderStatus(orderNumber) {
  return await callEdgeFunction('check-tripay-status', {
    order_number: orderNumber,
  });
}

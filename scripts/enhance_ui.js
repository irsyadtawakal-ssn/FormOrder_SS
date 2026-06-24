const fs = require('fs');
const path = require('path');

const stylePath = path.join(__dirname, '../assets/css/style.css');

const premiumCSS = `
/* ─── Premium UI Overrides (Suka Kitchen System) ──────────────────────────── */
button, .btn-primary, .btn-secondary, .cart-cta, .btn-add, .btn-add-big, .cart-item-btn {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

button:active, .btn-primary:active, .cart-cta:active {
  transform: scale(0.96);
}

button:hover, .btn-primary:hover, .cart-cta:hover {
  filter: brightness(1.05);
  box-shadow: 0 4px 12px rgba(112, 22, 4, 0.1);
}

.stat-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--line);
  background: var(--card);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--brand);
}

.admin-order-row, .card {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--line);
}

.admin-order-row:hover, .card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--brand);
}

input, select, textarea {
  transition: all 0.2s ease-in-out;
}

input:focus, select:focus, textarea:focus {
  box-shadow: 0 0 0 3px rgba(242, 151, 68, 0.15); /* Orange glow */
  border-color: var(--brand) !important;
}

.topbar {
  box-shadow: 0 2px 10px rgba(112, 22, 4, 0.04);
}

.admin-nav {
  box-shadow: 0 -4px 16px rgba(112, 22, 4, 0.06);
}

.toast {
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--line);
}
`;

fs.appendFileSync(stylePath, premiumCSS);
console.log('Premium CSS appended to style.css');

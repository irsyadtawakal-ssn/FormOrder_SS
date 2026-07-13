// ─── State ────────────────────────────────────────────────────────────────────
      let outletSlug = getParam("outlet"); // No default outlet
      let outlet = null;
      let allOutlets = [];
      let menuData = [];
      let activeCategory = "Semua";
      let cart = [];
      let activeCityFilter = "Semua";

      let currentItem = null;
      let currentVariants = [];
      let currentSel = {};
      let currentQty = 1;

      const SERVICE_FEE_RATE = 0; // Cart tampilkan subtotal saja — total final (+ fee) dihitung server-side saat checkout

      // ─── Init ─────────────────────────────────────────────────────────────────────
      (async function init() {
        if (outletSlug) {
          cart = getCart(outletSlug);
          updateCartBar();
        }

        // Pasang src gambar langsung dari Supabase Storage. Gambar sudah dikecilkan
        // + dikonversi WebP saat upload (lihat admin/settings.html), jadi ringan &
        // pasti bisa dirender di HP. Catatan: endpoint transform render/image TIDAK
        // dipakai karena hanya tersedia di plan berbayar (di plan free → 403).
        function setHeroImage(img, url) {
          if (!img || !url) return;
          img.onerror = function () {
            this.style.display = "none";
          };
          img.src = url;
          img.style.display = "block";
        }

        // Load hero banner and logo early
        window.db
          .from("app_settings")
          .select("key, value")
          .in("key", ["hero_banner_url", "hero_logo_url"])
          .then(({ data }) => {
            if (data && data.length > 0) {
              const bannerData = data.find((d) => d.key === "hero_banner_url");
              if (bannerData?.value) {
                setHeroImage(document.getElementById("heroBgImg"), bannerData.value);
              }
              const logoData = data.find((d) => d.key === "hero_logo_url");
              if (logoData?.value) {
                setHeroImage(document.getElementById("heroLogoImg"), logoData.value);
              }
            }
          });

        const promises = [
          window.db
            .from("outlets")
            .select(
              "id,slug,name,address,city,maps_url,open_hour,close_hour,is_active",
            )
            .eq("is_active", true)
            .order("name"),
        ];

        if (outletSlug) {
          promises.push(loadMenu());
        } else {
          promises.push(loadMenu(true));
        }

        const [outletsRes] = await Promise.all(promises);

        allOutlets = outletsRes.data || [];
        renderOutletDropdown();

        if (!outletSlug) {
          setTimeout(() => toggleOutletDropdown(true), 100);
        }
      })();

      function showSelectOutletEmptyState() {
        document.getElementById("outletSelName").textContent =
          "Pilih Lokasi Outlet";
        const addrEl = document.getElementById("outletSelAddr");
        if (addrEl) addrEl.textContent = "Buka daftar outlet untuk memilih";

        document.getElementById("menuContent").innerHTML = `
    <div class="empty" style="margin-top:40px">
      <div class="empty-icon"><i data-lucide="store" style="width:56px;height:56px;margin:0 auto;color:var(--brand)"></i></div>
      <div class="empty-title">Pilih Lokasi Outlet</div>
      <div class="empty-desc">Silakan pilih lokasi outlet terlebih dahulu untuk melihat menu.</div>
    </div>`;
        if (window.lucide) {
          lucide.createIcons();
        }
        document.getElementById("tabs").style.display = "none";
        document.getElementById("searchWrap").style.display = "none";
      }

      // ─── Outlet dropdown ──────────────────────────────────────────────────────────
      function getFilteredOutlets() {
        const q = (document.getElementById("outletSearch")?.value || "")
          .toLowerCase()
          .trim();
        return allOutlets.filter((o) => {
          const name = o.name.replace(/^Mitra\s+/i, "").toLowerCase();
          if (
            activeCityFilter !== "Semua" &&
            (o.city || "") !== activeCityFilter
          )
            return false;
          if (
            q &&
            !name.includes(q) &&
            !(o.address || "").toLowerCase().includes(q)
          )
            return false;
          return true;
        });
      }

      function renderOutletDropdown() {
        renderCityFilter();
        renderOutletDropdownItems(getFilteredOutlets());
      }

      function renderCityFilter() {
        // Kumpulkan kota unik dari data outlet, urutkan, tambahkan "Semua" di depan
        const citySet = new Set(allOutlets.map((o) => o.city).filter(Boolean));
        const cities = ["Semua", ...[...citySet].sort()];
        document.getElementById("cityFilter").innerHTML = cities
          .map(
            (c) => `
    <div class="city-chip ${activeCityFilter === c ? "active" : ""}"
         onclick="setCityFilter('${c}')">${c}</div>
  `,
          )
          .join("");
      }

      function setCityFilter(city) {
        activeCityFilter = city;
        renderCityFilter();
        renderOutletDropdownItems(getFilteredOutlets());
      }

      function renderOutletDropdownItems(outlets) {
        const list = document.getElementById("outletDropdownList");
        if (!outlets.length) {
          list.innerHTML = `<div style="padding:14px;text-align:center;color:var(--muted);font-size:13px">Outlet tidak ditemukan</div>`;
          return;
        }
        list.innerHTML = outlets
          .map((o) => {
            const open = isOutletOpen(o.open_hour, o.close_hour);
            const active = o.slug === outletSlug;
            const name = escHtml(o.name.replace(/^Mitra\s+/i, ""));
            const mapsUrl =
              o.maps_url ||
              `https://www.google.com/maps/search/${encodeURIComponent(o.name + " " + (o.address || ""))}`;
            return `
      <div class="outlet-drop-item ${active ? "active" : ""}" onclick="selectOutlet('${o.slug}')">
        <div class="outlet-drop-name">${name}</div>
        <div class="outlet-drop-meta">
          <span style="color:${open ? "var(--green)" : "var(--faint)"}">● ${open ? "Buka" : "Tutup"}</span>
          ${o.open_hour ? ` · ${formatHour(o.open_hour)}–${formatHour(o.close_hour)}` : ""}
        </div>
        ${
          o.address
            ? `
        <div class="outlet-drop-addr">
          <i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:text-bottom"></i> ${escHtml(o.address)}
          <a class="outlet-drop-maps" href="${mapsUrl}" target="_blank"
             onclick="event.stopPropagation()"><i data-lucide="map" style="width:12px;height:12px;vertical-align:text-bottom"></i> Maps</a>
        </div>`
            : ""
        }
      </div>`;
          })
          .join("");
      }

      function toggleOutletDropdown(forceOpen) {
        const dd = document.getElementById("outletDropdown");
        const arrow = document.getElementById("outletSelArrow");
        let open;
        if (typeof forceOpen === "boolean") {
          open = forceOpen;
        } else {
          open = dd.style.display === "none" || dd.style.display === "";
        }
        dd.style.display = open ? "block" : "none";
        arrow.textContent = open ? "▴" : "▾";
        if (open) {
          renderOutletDropdown();
          setTimeout(
            () => document.getElementById("outletSearch")?.focus(),
            50,
          );
        } else {
          const s = document.getElementById("outletSearch");
          if (s) s.value = "";
        }
      }

      function filterOutletDropdown(q) {
        renderOutletDropdownItems(getFilteredOutlets());
      }

      function closeOutletDropdown() {
        document.getElementById("outletDropdown").style.display = "none";
        document.getElementById("outletSelArrow").textContent = "▾";
      }

      async function selectOutlet(slug) {
        if (slug === outletSlug) {
          closeOutletDropdown();
          return;
        }

        // Reset cart kalau ganti outlet
        outletSlug = slug;
        cart = getCart(outletSlug);
        updateCartBar();
        closeOutletDropdown();

        // Update URL tanpa reload
        const url = new URL(window.location.href);
        url.searchParams.set("outlet", slug);
        window.history.replaceState({}, "", url);

        // Reset menu state
        activeCategory = "Semua";
        document.getElementById("menuContent").innerHTML = "";
        if (window.lucide) {
          lucide.createIcons();
        }
        document.getElementById("tabs").style.display = "none";
        document.getElementById("searchWrap").style.display = "none";

        await loadMenu();
      }

      // ─── Load menu ────────────────────────────────────────────────────────────────
      async function loadMenu(isViewOnly = false) {
        showMenuSkeleton();

        if (!isViewOnly) {
          const { data: outletData, error: outletErr } = await window.db
            .from("outlets")
            .select("id,slug,name,address,open_hour,close_hour,type,is_active")
            .eq("slug", outletSlug)
            .single();

          if (outletErr || !outletData) {
            document.getElementById("menuContent").innerHTML =
              `<div class="error-box"><p>Outlet tidak ditemukan.</p></div>`;
            if (window.lucide) {
              lucide.createIcons();
            }
            return;
          }

          outlet = outletData;
          document.title = "Order Sukashawarma";
          document.getElementById("outletSelName").textContent = outlet.name;
          const addrEl = document.getElementById("outletSelAddr");
          if (addrEl) addrEl.textContent = outlet.address || "";
        } else {
          document.getElementById("outletSelName").textContent = "Pilih Lokasi Outlet";
          const addrEl = document.getElementById("outletSelAddr");
          if (addrEl) addrEl.textContent = "Buka daftar outlet untuk memilih";
        }

        const promises = [
          window.db.from("categories").select("*").eq("is_active", true).order("sort_order"),
          window.db.from("menu_items").select("*").eq("is_active", true).order("sort_order"),
          window.db.from("menu_variants").select("*").order("sort_order"),
          window.db.from("menu_variant_options").select("*").order("sort_order"),
          window.db.from("promos").select("*").eq("is_active", true)
            .or(`start_at.is.null,start_at.lte."${new Date().toISOString()}"`)
            .or(`end_at.is.null,end_at.gte."${new Date().toISOString()}"`),
        ];
        if (!isViewOnly && outlet) {
          promises.push(window.db.from("outlet_menu_overrides").select("*").eq("outlet_id", outlet.id));
        }

        const [catRes, itemRes, varRes, optRes, promoRes, overrideRes] = await Promise.all(promises);

        if (catRes.error || itemRes.error) {
          document.getElementById("menuContent").innerHTML =
            `<div class="error-box"><p>Gagal memuat menu. Coba lagi.</p></div>`;
          if (window.lucide) {
            lucide.createIcons();
          }
          return;
        }

        const categories = catRes.data || [];
        const items = itemRes.data || [];
        const variants = varRes.data || [];
        const options = optRes.data || [];
        const promos = promoRes.data || [];
        const overrides = overrideRes ? overrideRes.data || [] : [];

        const overrideMap = {};
        overrides.forEach((o) => {
          overrideMap[o.menu_item_id] = o;
        });

        const optsByVariant = {};
        options.forEach((o) => {
          (optsByVariant[o.variant_id] =
            optsByVariant[o.variant_id] || []).push(o);
        });

        const varsByItem = {};
        variants.forEach((v) => {
          (varsByItem[v.menu_item_id] = varsByItem[v.menu_item_id] || []).push({
            ...v,
            options: optsByVariant[v.id] || [],
          });
        });

        const catMap = {};
        categories.forEach((c) => {
          catMap[c.id] = { ...c, items: [] };
        });

        items.forEach((item) => {
          const ov = overrideMap[item.id];
          let basePrice = ov?.price_override ?? item.base_price;
          let bestDiscount = 0;
          let promoName = null;
          
          // Calculate if any promo applies to this item
          for (const p of promos) {
             if (p.applies_to === 'all' || (p.applies_to === 'item' && p.item_ids && p.item_ids.includes(item.id))) {
                let discount = 0;
                if (p.discount_type === 'percent') {
                  discount = Math.round(basePrice * Number(p.discount_value) / 100);
                  if (p.max_discount != null) discount = Math.min(discount, Number(p.max_discount));
                } else {
                  discount = Math.min(Number(p.discount_value), basePrice);
                }
                if (discount > bestDiscount) {
                  bestDiscount = discount;
                  promoName = p.name;
                }
             }
          }

          let effectivePrice = basePrice - bestDiscount;
          // Set compare_price to basePrice if there's a discount, otherwise fallback to item.compare_price
          let comparePrice = bestDiscount > 0 ? basePrice : (item.compare_price ?? null);

          const enriched = {
            ...item,
            effectivePrice: effectivePrice,
            compare_price: comparePrice,
            promo_name: promoName,
            isAvailable: isViewOnly ? false : (ov ? ov.is_available : true),
            isViewOnly: isViewOnly,
            variants: varsByItem[item.id] || [],
          };
          if (catMap[item.category_id])
            catMap[item.category_id].items.push(enriched);
        });

        menuData = categories
          .map((c) => catMap[c.id])
          .filter((c) => c && c.items.length > 0);

        document.getElementById("searchWrap").style.display = "block";
        document.getElementById("tabs").style.display = "flex";
        const btnCart = document.getElementById("btnCart");
        if (btnCart) btnCart.style.display = "";

        renderTabs();
        renderMenu();
        if (!isViewOnly && outlet) {
          sukaPixelTrack("ViewContent", {
            content_name: outlet.name,
            content_category: "Menu Outlet",
          });
        }
      }

      function showMenuSkeleton() {
        document.getElementById("menuContent").innerHTML = `
    <div class="outlet-list" style="margin-top:12px">
      ${Array.from(
        { length: 4 },
        () => `
        <div class="skeleton-card">
          <div class="skeleton skeleton-photo"></div>
          <div class="skeleton-lines">
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line shorter"></div>
          </div>
        </div>`,
      ).join("")}
    </div>`;
      }

      // ─── Render tabs ──────────────────────────────────────────────────────────────
      function renderTabs() {
        let hasPromo = false;
        if (menuData) {
          menuData.forEach((cat) => {
            cat.items.forEach((item) => {
              if (item.compare_price && item.compare_price > item.effectivePrice) {
                hasPromo = true;
              }
            });
          });
        }

        const allCats = [
          { id: "Semua", label: "Semua" },
        ];
        if (hasPromo) {
          allCats.push({
            id: "Promo",
            label: '<i data-lucide="tag" style="width:14px;height:14px;vertical-align:text-bottom;fill:currentColor;margin-right:4px;"></i>Promo'
          });
        }
        allCats.push({
          id: "Best Seller",
          label:
            '<i data-lucide="star" style="width:14px;height:14px;vertical-align:text-bottom;fill:currentColor;margin-right:4px;"></i>Best Seller',
        });
        allCats.push(...menuData.map((c) => ({ id: c.name, label: c.name })));
        document.getElementById("tabs").innerHTML = allCats
          .map(
            (c) =>
              `<div class="tab ${c.id === activeCategory ? "active" : ""}" onclick="setCategory('${c.id.replace(/'/g, "\\'")}')">${c.label}</div>`,
          )
          .join("");
        if (window.lucide) {
          lucide.createIcons();
        }
      }

      function setCategory(c) {
        activeCategory = c;
        renderTabs();
        renderMenu();
        const el = document.getElementById("section-" + encodeURIComponent(c));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      // ─── Render menu items ─────────────────────────────────────────────────────────
      function onSearch() {
        renderMenu();
      }

      function renderMenu() {
        const q = document
          .getElementById("searchInput")
          .value.toLowerCase()
          .trim();

        let sections = [];

        // Kumpulkan item Promo dan Best Seller dari semua kategori
        let promoItems = [];
        let bestSellerItems = [];
        
        menuData.forEach((cat) => {
          cat.items.forEach((item) => {
            const isPromo = item.compare_price && item.compare_price > item.effectivePrice;
            
            if (isPromo) {
              if (
                q &&
                !item.name.toLowerCase().includes(q) &&
                !(item.description || "").toLowerCase().includes(q)
              )
                return;
              promoItems.push(item);
            } else if (item.is_best_seller) {
              if (
                q &&
                !item.name.toLowerCase().includes(q) &&
                !(item.description || "").toLowerCase().includes(q)
              )
                return;
              bestSellerItems.push(item);
            }
          });
        });

        // Masukkan section Promo
        if (activeCategory === "Semua" || activeCategory === "Promo") {
          if (promoItems.length > 0) {
            sections.push({
              name: "Promo",
              items: promoItems,
            });
          }
        }

        // Masukkan section Best Seller
        if (activeCategory === "Semua" || activeCategory === "Best Seller") {
          if (bestSellerItems.length > 0) {
            sections.push({
              name: "Best Seller",
              items: bestSellerItems,
            });
          }
        }

        // Masukkan kategori reguler
        if (activeCategory !== "Best Seller" && activeCategory !== "Promo") {
          menuData.forEach((cat) => {
            if (activeCategory !== "Semua" && cat.name !== activeCategory) return;

            let items = cat.items.filter((item) => {
              const isPromo = item.compare_price && item.compare_price > item.effectivePrice;
              
              if (activeCategory === "Semua") {
                if (isPromo) return false;
                if (item.is_best_seller) return false;
              }

              if (
                q &&
                !item.name.toLowerCase().includes(q) &&
                !(item.description || "").toLowerCase().includes(q)
              )
                return false;
              
              return true;
            });

            if (items.length > 0) {
              sections.push({
                name: cat.name,
                items: items,
              });
            }
          });
        }

        if (!sections.length) {
          document.getElementById("menuContent").innerHTML = `
      <div class="empty">
        <div class="empty-icon"><i data-lucide="utensils" style="width:40px;height:40px;margin:0 auto"></i></div>
        <div class="empty-title">Menu tidak ditemukan</div>
        <div class="empty-desc">Coba kata kunci lain.</div>
      </div>`;
          return;
        }

        document.getElementById("menuContent").innerHTML = sections
          .map(
            (cat) => `
    <div class="deal-section" id="section-${encodeURIComponent(cat.name)}">
      <div class="deal-section-title">${escHtml(cat.name)}</div>
      ${cat.items
        .map((item) => {
          const hasDiscount =
            item.compare_price && item.compare_price > item.effectivePrice;
          const discountPct = hasDiscount
            ? Math.round(
                ((item.compare_price - item.effectivePrice) /
                  item.compare_price) *
                  100,
              )
            : 0;
          const clickFn = item.isViewOnly
            ? `showToast('Pilih outlet terlebih dahulu untuk memesan'); toggleOutletDropdown(true);`
            : (item.isAvailable ? `openItemSheet('${item.id}')` : "");
          return `
        <div class="deal-card ${!item.isAvailable && !item.isViewOnly ? "unavailable" : ""}" onclick="${clickFn}">
          <div class="deal-img-wrap">
            <div class="deal-img">
              ${item.photo_url ? `<img src="${item.photo_url}" alt="${escHtml(item.name)}" loading="lazy" />` : '<i data-lucide="sandwich" style="width:40px;height:40px;color:var(--faint)"></i>'}
            </div>
            <div class="deal-badge-stack">
              ${hasDiscount ? `<span class="promo-badge">PROMO</span>` : ""}
              ${item.is_best_seller ? `<span class="deal-img-badge best-seller"><i data-lucide="star" style="width:10px;height:10px;fill:currentColor"></i> BEST SELLER</span>` : ""}
            </div>
            ${!item.isAvailable && !item.isViewOnly ? `<span class="deal-img-badge sold-out">HABIS</span>` : ""}
          </div>
          <div class="deal-body">
            <div class="deal-name">${escHtml(item.name)}</div>
            ${item.description ? `<div class="deal-desc">${escHtml(item.description)}</div>` : ""}
            <div class="deal-price-row">
              <div class="deal-price-info">
                <div class="deal-price">${formatRupiah(item.effectivePrice)}</div>
                ${
                  hasDiscount
                    ? `<div class="deal-price-meta">
                  <span class="deal-compare">${formatRupiah(item.compare_price)}</span>
                  <span class="deal-discount" title="${item.promo_name ? escHtml(item.promo_name) : `Diskon ${discountPct}%`}">${item.promo_name ? escHtml(item.promo_name) : `Diskon ${discountPct}%`}</span>
                </div>`
                    : ""
                }
              </div>
              ${item.isViewOnly
                ? `<button class="deal-add-btn" style="background:var(--brand-bg);color:var(--brand);font-size:11px;padding:4px 10px;border-radius:999px;width:auto;flex-shrink:0" onclick="event.stopPropagation();${clickFn}">Pilih Outlet</button>`
                : (item.isAvailable
                    ? `<button class="deal-add-btn" onclick="event.stopPropagation();openItemSheet('${item.id}')">+</button>`
                    : '')}
            </div>
          </div>
        </div>`;
        })
        .join("")}
    </div>
  `,
          )
          .join("");

        if (window.lucide) {
          lucide.createIcons();
        }
      }

      // ─── Item sheet ───────────────────────────────────────────────────────────────
      function openItemSheet(itemId) {
        for (const cat of menuData) {
          const found = cat.items.find((i) => i.id === itemId);
          if (found) {
            currentItem = found;
            break;
          }
        }
        if (!currentItem) return;

        currentVariants = currentItem.variants;
        currentQty = 1;
        currentSel = {};
        currentVariants.forEach((v) => {
          if (!v.is_multi) {
            const def = v.options.find((o) => o.is_default) || v.options[0];
            currentSel[v.id] = def ? def.name : null;
          } else {
            currentSel[v.id] = [];
          }
        });

        document.getElementById("sheetItemName").textContent = currentItem.name;
        renderItemSheet();
        showSheet("itemSheet");
      }

      function renderItemSheet() {
        let html = `
    <div class="item-hero">
      ${currentItem.photo_url ? `<img id="itemSheetImg" src="${currentItem.photo_url}" alt="${currentItem.name}" decoding="async" fetchpriority="high" />` : '<i id="itemSheetImg" data-lucide="sandwich" style="width:40px;height:40px;color:var(--faint)"></i>'}
    </div>
    ${currentItem.description ? `<p style="color:var(--muted);font-size:14px;margin:0 0 18px">${escHtml(currentItem.description)}</p>` : ""}`;

        currentVariants.forEach((v) => {
          html += `<div class="variant-group">
      <div class="variant-label">
        ${escHtml(v.label)}
        ${v.is_required ? '<span class="variant-req">Wajib</span>' : '<span class="variant-opt-label">Opsional</span>'}
      </div>`;
          v.options.forEach((o) => {
            const checked = v.is_multi
              ? currentSel[v.id].includes(o.name)
              : currentSel[v.id] === o.name;
            html += `
        <label class="opt" onclick="event.stopPropagation();selectOpt('${v.id}',${v.is_multi},'${o.name.replace(/'/g, "\\'")}')">
          <span class="opt-left">
            <input type="${v.is_multi ? "checkbox" : "radio"}" name="v${v.id}" ${checked ? "checked" : ""} />
            ${escHtml(o.name)}
          </span>
          <span class="opt-price">${o.price_modifier > 0 ? "+ " + formatRupiah(o.price_modifier) : ""}</span>
        </label>`;
          });
          html += `</div>`;
        });

        html += `
    <div class="variant-group">
      <div class="variant-label">Catatan <span class="variant-opt-label">Opsional</span></div>
      <textarea class="notes" id="itemNote" placeholder="Contoh: tanpa bawang, tidak pedas…"></textarea>
    </div>
    <div class="variant-group">
      <div class="variant-label">Jumlah</div>
      <div class="qty-row">
        <button class="qty-btn" onclick="changeQty(-1)">−</button>
        <span id="qtyDisplay">${currentQty}</span>
        <button class="qty-btn plus" onclick="changeQty(1)">+</button>
      </div>
    </div>`;

        const sheetBody = document.getElementById("sheetItemBody");
        sheetBody.innerHTML = html;
        // Hanya jalankan lucide jika ada ikon yang perlu dirender (mis. item tanpa foto).
        // Item dengan foto tidak punya data-lucide, jadi lewati scan dokumen yang berat.
        if (window.lucide && sheetBody.querySelector("[data-lucide]")) {
          lucide.createIcons();
        }
        updateSheetPrice();
      }

      function selectOpt(variantId, isMulti, name) {
        if (isMulti) {
          const arr = currentSel[variantId];
          const idx = arr.indexOf(name);
          if (idx >= 0) arr.splice(idx, 1);
          else arr.push(name);
        } else {
          currentSel[variantId] = name;
        }
        // Input (radio/checkbox) berada di dalam <label>, jadi browser sudah
        // meng-update tampilan centang secara native. Cukup hitung ulang harga —
        // tidak perlu rebuild seluruh sheet (yang berat & men-decode ulang foto).
        updateSheetPrice();
      }

      function changeQty(delta) {
        currentQty = Math.max(1, currentQty + delta);
        const el = document.getElementById("qtyDisplay");
        if (el) el.textContent = currentQty;
        updateSheetPrice();
      }

      function calcUnitPrice() {
        let p = currentItem.effectivePrice;
        currentVariants.forEach((v) => {
          if (v.is_multi) {
            currentSel[v.id].forEach((name) => {
              const opt = v.options.find((o) => o.name === name);
              if (opt) p += opt.price_modifier;
            });
          } else if (currentSel[v.id]) {
            const opt = v.options.find((o) => o.name === currentSel[v.id]);
            if (opt) p += opt.price_modifier;
          }
        });
        return p;
      }

      function updateSheetPrice() {
        const el = document.getElementById("sheetItemPrice");
        if (el) el.textContent = formatRupiah(calcUnitPrice() * currentQty);
      }

      function validateSelections() {
        for (const v of currentVariants) {
          if (v.is_required && !v.is_multi && !currentSel[v.id]) return false;
          if (v.is_required && v.is_multi && currentSel[v.id].length === 0)
            return false;
        }
        return true;
      }

      function animateFlyToCart() {
        const sourceImg = document.getElementById("itemSheetImg");
        const cartBar = document.getElementById("cartBar");
        
        if (!sourceImg || !cartBar) return;
        
        const rect = sourceImg.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        
        // Buat elemen pembungkus luar (untuk pergerakan sumbu X secara stabil/linear)
        const wrapper = document.createElement("div");
        wrapper.classList.add("flying-wrapper");
        wrapper.style.top = rect.top + "px";
        wrapper.style.left = rect.left + "px";
        wrapper.style.width = size + "px";
        wrapper.style.height = size + "px";
        
        // Buat elemen dalam (untuk pergerakan sumbu Y dengan gravitasi + scale + rotate)
        const clone = sourceImg.cloneNode(true);
        clone.classList.add("flying-inner");
        clone.style.width = "100%";
        clone.style.height = "100%";
        clone.style.margin = "0"; 
        clone.style.objectFit = "cover";
        
        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);
        
        // Force reflow agar transisi berjalan
        wrapper.offsetWidth;
        
        // Target spesifik ke ikon hitungan/badge keranjang
        const cartCountBadge = document.getElementById("cartCount");
        const cartRect = cartCountBadge ? cartCountBadge.getBoundingClientRect() : cartBar.getBoundingClientRect();
        
        // Target presisi ke tengah badge
        const targetX = cartRect.left + (cartRect.width / 2); 
        const targetY = cartRect.top + (cartRect.height / 2);
        
        // Hitung jarak (pusat ke pusat)
        const deltaX = targetX - (rect.left + size / 2);
        const deltaY = targetY - (rect.top + size / 2);
        
        // 1. Wrapper terbang secara linear ke arah X
        wrapper.style.transform = `translateX(${deltaX}px)`;
        
        // 2. Inner terbang ke arah Y dengan kurva khusus yang menghasilkan efek pop-out & parabola
        clone.style.transform = `translateY(${deltaY}px) scale(0.15) rotate(15deg)`;
        clone.style.opacity = "0.8"; 
        
        // Hapus elemen setelah animasi selesai (0.8 detik disinkronisasi dari CSS)
        setTimeout(() => {
          if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
          
          // Efek jelly pantulan saat barang masuk
          if (cartCountBadge) {
            cartCountBadge.classList.add("badge-pop");
            setTimeout(() => {
              cartCountBadge.classList.remove("badge-pop");
            }, 500); // durasi jelly
          }
          
          if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate([30, 50, 30]); // Haptic feedback ala startup besar
          }
        }, 800); 
      }

      function addToCart() {
        if (!validateSelections()) {
          showToast("Pilih semua opsi yang wajib terlebih dahulu");
          return;
        }
        const note = (document.getElementById("itemNote") || {}).value || "";
        const unitPrice = calcUnitPrice();
        const selections = JSON.parse(JSON.stringify(currentSel));

        const optionIds = [];
        currentVariants.forEach((v) => {
          if (v.is_multi) {
            (currentSel[v.id] || []).forEach((name) => {
              const opt = v.options.find((o) => o.name === name);
              if (opt) optionIds.push(opt.id);
            });
          } else if (currentSel[v.id]) {
            const opt = v.options.find((o) => o.name === currentSel[v.id]);
            if (opt) optionIds.push(opt.id);
          }
        });

        cart.push({
          menuItemId: currentItem.id,
          name: currentItem.name,
          unitPrice,
          qty: currentQty,
          selections,
          optionIds,
          note,
        });
        setCart(outletSlug, cart);
        
        // Trigger animasi terbang
        animateFlyToCart();
        
        updateCartBar();
        closeAllSheets();
        showToast("✓ " + currentItem.name + " ditambahkan");
        sukaPixelTrack("AddToCart", {
          content_name: currentItem.name,
          value: unitPrice * currentQty,
          currency: "IDR",
        });
      }

      // ─── Cart bar ─────────────────────────────────────────────────────────────────
      function updateCartBar() {
        const count = getCartCount(cart);
        const total = getCartTotal(cart);
        document.getElementById("cartCount").textContent = count;
        document.getElementById("cartLabel").textContent = count + " item";
        document.getElementById("cartTotal").textContent = formatRupiah(total);
        document
          .getElementById("cartBar")
          .classList.toggle("hidden", count === 0);
      }

      // ─── Cart sheet ───────────────────────────────────────────────────────────────
      function openCartSheet() {
        if (!cart.length) {
          showToast("Keranjang masih kosong");
          return;
        }
        renderCartSheet();
        showSheet("cartSheet");
      }

      function renderCartSheet() {
        const subtotal = getCartTotal(cart);
        const fee = Math.ceil(subtotal * SERVICE_FEE_RATE);
        const total = subtotal + fee;

        let html = '<div class="summary-box">';
        cart.forEach((item, idx) => {
          const sel = summarizeSelections(item.selections);
          html += `<div class="summary-row">
      <span class="n">
        <b>${item.qty}× ${item.name}</b>
        ${sel ? `<br/><span style="color:var(--muted);font-size:12px">${sel}</span>` : ""}
        ${item.note ? `<br/><span style="color:var(--muted);font-size:12px"><i data-lucide="pencil" style="width:12px;height:12px;vertical-align:text-bottom"></i> ${item.note}</span>` : ""}
      </span>
      <span style="text-align:right;white-space:nowrap">
        ${formatRupiah(item.unitPrice * item.qty)}
        <br/><span class="del" onclick="removeCartItem(${idx})">Hapus</span>
      </span>
    </div>`;
        });
        html += `<div class="summary-row total"><span>Subtotal</span><span>${formatRupiah(subtotal)}</span></div>`;
        html += "</div>";

        document.getElementById("cartItems").innerHTML = html;
        if (window.lucide) {
          lucide.createIcons();
        }
        document.getElementById("checkoutTotal").textContent =
          formatRupiah(subtotal);
      }

      function removeCartItem(idx) {
        cart.splice(idx, 1);
        setCart(outletSlug, cart);
        updateCartBar();
        if (!cart.length) {
          closeAllSheets();
          return;
        }
        renderCartSheet();
      }

      // ─── Submit order ─────────────────────────────────────────────────────────────
      function submitOrder() {
        let valid = true;
        [
          { id: "fName", validate: (v) => v.trim().length >= 2 },
          { id: "fWA", validate: (v) => validateWA(v) },
          { id: "fTime", validate: (v) => v.trim().length > 0 },
        ].forEach((f) => {
          const input = document.getElementById(f.id);
          const wrap = input.closest(".field");
          if (!f.validate(input.value)) {
            wrap.classList.add("has-error");
            valid = false;
          } else wrap.classList.remove("has-error");
        });
        if (!valid) {
          showToast("Lengkapi data yang diperlukan");
          return;
        }

        const checkoutData = {
          outletSlug,
          outletId: outlet.id,
          outletName: outlet.name,
          outletAddress: outlet.address,
          customerName: document.getElementById("fName").value.trim(),
          customerWA: normalizeWA(document.getElementById("fWA").value),
          pickupTime: document.getElementById("fTime").value.trim(),
          notes: document.getElementById("fNote").value.trim(),
          cart,
        };
        sessionStorage.setItem("suka_checkout", JSON.stringify(checkoutData));
        window.location.href = "checkout.html";
      }

      // ─── Sheet helpers ────────────────────────────────────────────────────────────
      function adjustSheetForKeyboard() {
        const sheets = document.querySelectorAll(".sheet.show");
        if (!sheets.length) return;
        const keyboardH =
          window.innerHeight -
          window.visualViewport.height -
          window.visualViewport.offsetTop;
        sheets.forEach((el) => {
          el.style.bottom = Math.max(0, keyboardH) + "px";
        });
      }

      function showSheet(id) {
        document.getElementById("scrim").classList.add("show");
        document.getElementById(id).classList.add("show");
        document.body.style.overflow = "hidden";
        if (window.visualViewport) {
          window.visualViewport.addEventListener(
            "resize",
            adjustSheetForKeyboard,
          );
          window.visualViewport.addEventListener(
            "scroll",
            adjustSheetForKeyboard,
          );
        }
      }

      function closeAllSheets() {
        ["itemSheet", "cartSheet"].forEach((id) => {
          const el = document.getElementById(id);
          el.classList.remove("show");
          el.style.bottom = "";
        });
        document.getElementById("scrim").classList.remove("show");
        document.body.style.overflow = "";
        if (window.visualViewport) {
          window.visualViewport.removeEventListener(
            "resize",
            adjustSheetForKeyboard,
          );
          window.visualViewport.removeEventListener(
            "scroll",
            adjustSheetForKeyboard,
          );
        }
      }
    

      if ("serviceWorker" in navigator)
        navigator.serviceWorker.register("/sw.js");
    

      if (window.lucide) {
        lucide.createIcons();
      }
/* ---------------------------------------------------------------------------
   KrishiDakshina storefront – client-side script.
   Extracted from static/index.html so the page's Content-Security-Policy can
   drop 'unsafe-inline' from script-src (blocks injected inline scripts and
   inline event-handler attributes).
   --------------------------------------------------------------------------- */

'use strict';

/* ── Image fallback (delegated, capture-phase because `error` events don't bubble).
   Registered as early as possible so we catch failed <img> loads for elements
   annotated with data-fallback="…". Even if a few errors fire before this
   script downloads (defer'd), the post-parse pass below catches those. ── */
function applyImgFallback(img) {
  const parent = img?.parentElement;
  if (!parent) return;
  const fallback = img.dataset?.fallback ?? '';
  while (parent.firstChild) parent.firstChild.remove();
  parent.textContent = fallback; // textContent is safe (no HTML parsing)
}
document.addEventListener('error', (ev) => {
  const t = ev.target;
  if (t?.tagName === 'IMG' && t.dataset?.fallback) {
    applyImgFallback(t);
  }
}, true);
// Catch-up pass: images that already errored before the listener attached.
document.querySelectorAll('img[data-fallback]').forEach(img => {
  if (img.complete && img.naturalWidth === 0) applyImgFallback(img);
});

/* ── CSPRNG-backed float in [0, 1). Replaces Math.random() for decorative
   values – Sonar flags Math.random() as a weak PRNG. This is strictly stronger
   even for cosmetic use and silences the warning. ── */
function randFloat() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296; // 2**32
}

/* ── Small helper: swap a button's icon child without touching innerHTML. ── */
function setBtnIcon(btn, iconClass) {
  while (btn.firstChild) btn.firstChild.remove();
  const i = document.createElement('i');
  i.className = iconClass;
  btn.appendChild(i);
}

/* ── Year ── */
document.getElementById('yr').textContent = new Date().getFullYear();

/* ── Navbar scroll ── */
const nav = document.getElementById('nav');
const topBtn = document.getElementById('top-btn');
window.addEventListener('scroll', () => {
  nav.classList.toggle('on', window.scrollY > 40);
  topBtn.classList.toggle('vis', window.scrollY > 300);
}, { passive: true });

/* ── Active link ── */
const sects = document.querySelectorAll('section[id]');
const navAs = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
  let cur = '';
  sects.forEach(s => { if (window.scrollY >= s.offsetTop - 110) cur = s.id; });
  navAs.forEach(a => a.classList.toggle('cur', a.getAttribute('href') === '#' + cur));
}, { passive: true });

/* ── Mobile menu ── */
const hb = document.getElementById('hb');
const mobNav = document.getElementById('mobNav');
function mClose() { hb.classList.remove('o'); mobNav.classList.remove('o'); }
hb.addEventListener('click', () => { hb.classList.toggle('o'); mobNav.classList.toggle('o'); });
// Delegated close-on-link-click (replaces the removed inline onclick="mClose()" attributes).
mobNav.querySelectorAll('a').forEach(a => a.addEventListener('click', mClose));

/* ── Scroll to top ── */
topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ── Intersection Observer (fade-in) ── */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('vis'), i * 90);
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.10 });
document.querySelectorAll('.fi').forEach(el => io.observe(el));

/* ── CART SYSTEM + WHATSAPP ORDER ── */
const WHATSAPP_NUMBER = '918970059754'; // <- replace with your WhatsApp business number

// Cart persists in localStorage so items survive page reloads / new tabs.
// Storage is per-browser (each visitor has their own cart – multi-user safe).
// NOTE: namespace 'krishidakshina.*' matches the site brand; the v1 suffix is
// the schema version — any shape change bumps to .v2 with a migrate/reset path.
const CART_STORAGE_KEY = 'krishidakshina.cart.v1';
const MAX_QTY_PER_ITEM = 99;   // guard against tampered qty (abuse / giant WhatsApp text)
const MAX_CART_ITEMS   = 50;   // guard against tampered storage adding hundreds of rows
const MAX_NAME_LEN     = 200;
const MAX_UNIT_LEN     = 50;
const MAX_PRICE        = 1_000_000;

// Strict schema check: cart data comes from localStorage which is user-writable
// (via devtools, browser extensions, shared devices, or same-origin XSS). Reject
// anything that isn't the exact shape we expect before touching the DOM.
function isValidCartItem(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    && typeof v.name === 'string'  && v.name.length > 0 && v.name.length <= MAX_NAME_LEN
    && typeof v.price === 'number' && Number.isFinite(v.price) && v.price >= 0 && v.price <= MAX_PRICE
    && typeof v.unit === 'string'  && v.unit.length <= MAX_UNIT_LEN
    && Number.isInteger(v.qty)     && v.qty > 0 && v.qty <= MAX_QTY_PER_ITEM;
}

let cart = {};
try {
  const raw = localStorage.getItem(CART_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const clean = {};
      let count = 0;
      for (const k of Object.keys(parsed)) {
        if (count >= MAX_CART_ITEMS) break;
        if (typeof k === 'string' && k.length > 0 && k.length <= 100 && isValidCartItem(parsed[k])) {
          // Copy only known fields – no prototype pollution, no extra data.
          clean[k] = {
            name:  parsed[k].name,
            price: parsed[k].price,
            unit:  parsed[k].unit,
            qty:   parsed[k].qty
          };
          count++;
        }
      }
      cart = clean;
    }
  }
} catch (err) {
  console.warn('Cart load failed, starting empty:', err);
  cart = {};
}

function saveCart() {
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }
  catch (err) { console.warn('Cart save failed (storage full or private mode):', err); }
}

const cartDrawer  = document.getElementById('cartDrawer');
const cartOverlay = document.getElementById('cartOverlay');
const cartItemsEl = document.getElementById('cartItems');
const cartEmptyEl = document.getElementById('cartEmpty');
const cartFootEl  = document.getElementById('cartFoot');
const cartTotalEl = document.getElementById('cartTotal');
const cartTotalDeliveryEl = document.getElementById('cartTotalDelivery');
const cartReviewPanel = document.getElementById('cartReviewPanel');
const cartDeliveryPanel = document.getElementById('cartDeliveryPanel');
const stepReview = document.getElementById('stepReview');
const stepDelivery = document.getElementById('stepDelivery');
const btnToDelivery = document.getElementById('btnToDelivery');
const btnBackToCart = document.getElementById('btnBackToCart');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let checkoutStep = 'review';

function animatePanelIn(el) {
  if (!el || prefersReducedMotion.matches) return;
  el.classList.remove('panel-animate-in');
  el.getBoundingClientRect();
  el.classList.add('panel-animate-in');
}

function setCheckoutStep(step, opts = {}) {
  const hasItems = Object.keys(cart).length > 0;
  const nextStep = (step === 'delivery' && hasItems) ? 'delivery' : 'review';
  if (step === 'delivery' && !hasItems && opts.warnWhenEmpty) {
    setHint('Add at least one item in cart before entering delivery details.', 'err');
  }
  checkoutStep = nextStep;

  const deliveryMode = checkoutStep === 'delivery';
  cartDrawer.classList.toggle('delivery-step', deliveryMode);
  cartItemsEl.classList.toggle('is-hidden', deliveryMode);
  cartReviewPanel.classList.toggle('is-hidden', deliveryMode);
  cartDeliveryPanel.classList.toggle('is-hidden', !deliveryMode);
  stepReview.classList.toggle('is-active', !deliveryMode);
  stepDelivery.classList.toggle('is-active', deliveryMode);
  stepReview.setAttribute('aria-pressed', String(!deliveryMode));
  stepDelivery.setAttribute('aria-pressed', String(deliveryMode));

  if (deliveryMode) {
    animatePanelIn(cartDeliveryPanel);
    if (cartFootEl) cartFootEl.scrollTop = 0;
  } else {
    animatePanelIn(cartItemsEl);
    animatePanelIn(cartReviewPanel);
  }

  if (deliveryMode && opts.focusField && dName !== undefined && dName !== null) {
    requestAnimationFrame(() => dName.focus());
  }
}

function openCart()  {
  cartDrawer.classList.add('o');
  cartOverlay.classList.add('o');
  document.body.style.overflow = 'hidden';
  setCheckoutStep('review');
}
function closeCart() { cartDrawer.classList.remove('o'); cartOverlay.classList.remove('o'); document.body.style.overflow = ''; }

document.getElementById('cartBtn').addEventListener('click', openCart);
document.getElementById('cartClose').addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

function renderCart() {
  const keys    = Object.keys(cart);
  const badge   = document.getElementById('cartBadge');

  const totalQty = keys.reduce((s, k) => s + cart[k].qty, 0);
  badge.textContent = totalQty;
  badge.classList.toggle('has', totalQty > 0);
  saveCart();

  while (cartItemsEl.firstChild) cartItemsEl.firstChild.remove();

  if (!keys.length) {
    cartItemsEl.appendChild(cartEmptyEl);
    cartFootEl.classList.add('is-hidden');
    cartTotalEl.textContent = '\u20b90';
    cartTotalDeliveryEl.textContent = '\u20b90';
    setCheckoutStep('review');
    return;
  }

  // Build rows with DOM APIs and textContent – never interpolate name/unit into
  // an innerHTML string, because those originate from localStorage (see load
  // validation above) and any HTML would otherwise be parsed and executed.
  let total = 0;
  keys.forEach(k => {
    const { name, price, unit, qty } = cart[k];
    const lineTotal = price * qty;
    total += lineTotal;

    const row = document.createElement('div');
    row.className = 'cart-item';

    const info = document.createElement('div');
    info.className = 'ci-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'ci-name';
    nameEl.title = name;
    nameEl.textContent = name;
    const unitEl = document.createElement('div');
    unitEl.className = 'ci-unit';
    unitEl.textContent = unit;
    info.appendChild(nameEl);
    info.appendChild(unitEl);

    const ctrl = document.createElement('div');
    ctrl.className = 'qty-ctrl';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'qty-btn';
    minus.dataset.key = k;
    minus.dataset.op = '-';
    minus.setAttribute('aria-label', 'Decrease qty');
    minus.textContent = '-';
    const num = document.createElement('span');
    num.className = 'qty-num';
    num.textContent = String(qty);
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'qty-btn';
    plus.dataset.key = k;
    plus.dataset.op = '+';
    plus.setAttribute('aria-label', 'Increase qty');
    plus.textContent = '+';
    ctrl.appendChild(minus);
    ctrl.appendChild(num);
    ctrl.appendChild(plus);

    const priceEl = document.createElement('div');
    priceEl.className = 'ci-price';
    priceEl.textContent = '\u20b9' + lineTotal;

    row.appendChild(info);
    row.appendChild(ctrl);
    row.appendChild(priceEl);
    cartItemsEl.appendChild(row);
  });

  cartTotalEl.textContent = '\u20b9' + total;
  cartTotalDeliveryEl.textContent = '\u20b9' + total;
  cartFootEl.classList.remove('is-hidden');
  setCheckoutStep(checkoutStep);

  cartItemsEl.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      if (!cart[k]) return;
      if (btn.dataset.op === '+') {
        if (cart[k].qty < MAX_QTY_PER_ITEM) cart[k].qty++;
      } else {
        cart[k].qty--;
        if (cart[k].qty <= 0) delete cart[k];
      }
      renderCart();
    });
  });

  updateOrderBtnState();
}

btnToDelivery.addEventListener('click', () => {
  if (!Object.keys(cart).length) return;
  setCheckoutStep('delivery', { focusField: true });
});

btnBackToCart.addEventListener('click', () => {
  setCheckoutStep('review');
});

stepReview.addEventListener('click', () => {
  setCheckoutStep('review');
});

stepDelivery.addEventListener('click', () => {
  setCheckoutStep('delivery', { focusField: true, warnWhenEmpty: true });
});

/* Add to cart – reads product name, price, unit from the card DOM. */
document.querySelectorAll('.btn-add').forEach(btn => {
  btn.addEventListener('click', function () {
    const card  = this.closest('.pcard');
    const name  = card.querySelector('.pname').textContent.trim();
    // Price node text looks like "₹55 / 250 g" – capture ONLY the first number
    // (stripping all non-digits would concatenate "55" + "250" = 55250).
    const priceEl = card.querySelector('.pprice');
    const priceText = priceEl.textContent.trim();
    const priceMatch = priceText.match(/\d[\d,]*/);
    const price = priceMatch ? Number.parseInt(priceMatch[0].replaceAll(',', ''), 10) : 0;
    // Unit is everything after the "/" (e.g. "kg", "250 g", "dozen")
    const smallEl = priceEl.querySelector('small');
    let unitRaw = '';
    if (smallEl) {
      unitRaw = smallEl.textContent;
    } else {
      const m = priceText.match(/\/\s*(.+)/);
      unitRaw = m ? m[1] : '';
    }
    const unit = unitRaw.replace(/^\/\s*/, '').trim();
    const key  = name.toLowerCase().replace(/\s+/g, '-');

    // Cap qty per item and total distinct items to blunt storage-tampering abuse.
    if (cart[key]) {
      if (cart[key].qty < MAX_QTY_PER_ITEM) cart[key].qty++;
    } else if (Object.keys(cart).length < MAX_CART_ITEMS) {
      cart[key] = { name, price, unit, qty: 1 };
    }
    renderCart();

    // Button feedback (safe DOM APIs – no innerHTML, no inline style assignment).
    setBtnIcon(this, 'fa-solid fa-check');
    this.classList.add('btn-add--ok');
    setTimeout(() => {
      setBtnIcon(this, 'fa-solid fa-plus');
      this.classList.remove('btn-add--ok');
    }, 1400);
  });
});

/* Clear entire cart */
document.getElementById('btnClearCart').addEventListener('click', () => {
  for (const k of Object.keys(cart)) delete cart[k];
  renderCart();
});

/* ────────────────────────────────────────────────────────────────
   DELIVERY DETAILS FORM (persisted in localStorage)

   Security posture mirrors the cart:
     • strict schema validation on load (isValidCustomer)
     • length caps on every field
     • all echo-back done via textContent / .value (no innerHTML)
     • pincode lookup restricted by CSP connect-src allow-list
     • geolocation is opt-in (button-triggered), not auto-requested
   ──────────────────────────────────────────────────────────────── */
const CUSTOMER_STORAGE_KEY = 'krishidakshina.customer.v1';
const MAX_CNAME_LEN = 100;
const MAX_ADDR_LEN  = 200;
const MAX_CITY_LEN  = 100;
const MAX_NOTES_LEN = 500;
const MAX_PHONE_LEN = 20;   // raw string cap before normalisation
const MAX_MSG_LEN   = 3800; // WhatsApp URL text-length safety cap (well under wa.me's ~4KB)
const POSTAL_API    = 'https://api.postalpincode.in/pincode/';

const dName    = document.getElementById('dName');
const dPhone   = document.getElementById('dPhone');
const dAddr1   = document.getElementById('dAddr1');
const dAddr2   = document.getElementById('dAddr2');
const dPincode = document.getElementById('dPincode');
const dCity    = document.getElementById('dCity');
const dNotes   = document.getElementById('dNotes');
const btnGeo   = document.getElementById('btnGeo');
const geoLabel = document.getElementById('geoLabel');
const delivHint = document.getElementById('delivHint');
const delivHintOut = delivHint.querySelector('output');
const btnWaOrder = document.getElementById('btnWaOrder');

// Held in-memory only; per-order value, not persisted.
let geoLoc = null; // { lat: number, lng: number } | null

function normalizePhone(v) {
  // Strip +, spaces, parens, dashes; drop leading 91 if it precedes a 10-digit number.
  return String(v || '').replace(/[+\s()-]/g, '').replace(/^91(?=\d{10}$)/, '');
}
function isValidPhone(v)   { return /^[6-9]\d{9}$/.test(normalizePhone(v)); }
function isValidPincode(v) { return /^[1-9]\d{5}$/.test(String(v || '').trim()); }
function isNonEmpty(v, max) {
  const s = String(v || '').trim();
  return s.length > 0 && s.length <= max;
}
function isStrLen(v, max) {
  return typeof v === 'string' && v.length <= max;
}

function isValidCustomer(c) {
  return c && typeof c === 'object' && !Array.isArray(c)
    && isStrLen(c.name,    MAX_CNAME_LEN)
    && isStrLen(c.phone,   MAX_PHONE_LEN)
    && isStrLen(c.addr1,   MAX_ADDR_LEN)
    && isStrLen(c.addr2,   MAX_ADDR_LEN)
    && isStrLen(c.city,    MAX_CITY_LEN)
    && isStrLen(c.pincode, 6)
    && isStrLen(c.notes,   MAX_NOTES_LEN);
}

// Load previously-saved customer details (best-effort; validated).
try {
  const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (isValidCustomer(parsed)) {
      dName.value    = parsed.name;
      dPhone.value   = parsed.phone;
      dAddr1.value   = parsed.addr1;
      dAddr2.value   = parsed.addr2;
      dCity.value    = parsed.city;
      dPincode.value = parsed.pincode;
      dNotes.value   = parsed.notes;
    }
  }
} catch (err) {
  console.warn('Customer details load failed:', err);
}

function saveCustomer() {
  const c = {
    name:    dName.value.slice(0, MAX_CNAME_LEN),
    phone:   dPhone.value.slice(0, MAX_PHONE_LEN),
    addr1:   dAddr1.value.slice(0, MAX_ADDR_LEN),
    addr2:   dAddr2.value.slice(0, MAX_ADDR_LEN),
    city:    dCity.value.slice(0, MAX_CITY_LEN),
    pincode: dPincode.value.slice(0, 6),
    notes:   dNotes.value.slice(0, MAX_NOTES_LEN)
  };
  try { localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(c)); }
  catch (err) { console.warn('Customer save failed:', err); }
}

function setHint(text, cls) {
  delivHintOut.textContent = text || '';
  delivHint.classList.remove('err', 'ok');
  if (cls) delivHint.classList.add(cls);
}

function validateForm() {
  const results = {
    name:    isNonEmpty(dName.value,    MAX_CNAME_LEN),
    phone:   isValidPhone(dPhone.value),
    addr1:   isNonEmpty(dAddr1.value,   MAX_ADDR_LEN),
    city:    isNonEmpty(dCity.value,    MAX_CITY_LEN),
    pincode: isValidPincode(dPincode.value)
  };
  // Only mark red once the user has typed something (avoid an all-red form on first open).
  dName.classList.toggle('invalid',    dName.value.length > 0    && !results.name);
  dPhone.classList.toggle('invalid',   dPhone.value.length > 0   && !results.phone);
  dAddr1.classList.toggle('invalid',   dAddr1.value.length > 0   && !results.addr1);
  dCity.classList.toggle('invalid',    dCity.value.length > 0    && !results.city);
  dPincode.classList.toggle('invalid', dPincode.value.length > 0 && !results.pincode);
  return Object.values(results).every(Boolean);
}

function updateOrderBtnState() {
  const hasItems = Object.keys(cart).length > 0;
  btnWaOrder.disabled = !(hasItems && validateForm());
}

[dName, dPhone, dAddr1, dAddr2, dCity, dPincode, dNotes].forEach(el => {
  el.addEventListener('input', () => { saveCustomer(); updateOrderBtnState(); });
});

// Pincode → auto-fill city (Indian postal API). Only triggers if City is empty.
let pincodeAbort = null;
dPincode.addEventListener('input', () => {
  const v = dPincode.value.trim();
  if (!isValidPincode(v))          return;
  if (dCity.value.trim().length)   return; // don't overwrite user input
  if (pincodeAbort) pincodeAbort.abort();
  pincodeAbort = new AbortController();
  fetch(POSTAL_API + encodeURIComponent(v), { signal: pincodeAbort.signal })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))
    .then(data => {
      const po = Array.isArray(data) && data[0]?.PostOffice?.[0];
      if (po && typeof po.District === 'string') {
        // Slice bounds the response before it touches the DOM.
        dCity.value = po.District.slice(0, MAX_CITY_LEN);
        saveCustomer();
        updateOrderBtnState();
        const state = typeof po.State === 'string' ? po.State.slice(0, 100) : '';
        setHint('Auto-filled: ' + dCity.value + (state ? ', ' + state : ''), 'ok');
      }
    })
    .catch(err => {
      if (err.name !== 'AbortError') console.warn('Pincode lookup failed:', err);
    });
});

// Geolocation button (opt-in, HTTPS-only).
btnGeo.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    setHint('Geolocation is not supported by this browser.', 'err');
    return;
  }
  btnGeo.disabled = true;
  geoLabel.textContent = 'Getting location…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      geoLoc = {
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6))
      };
      btnGeo.classList.add('ok');
      geoLabel.textContent = 'Location captured ✓';
      btnGeo.disabled = false;
      setHint('Your location pin will be sent along with the order.', 'ok');
    },
    (err) => {
      btnGeo.disabled = false;
      btnGeo.classList.remove('ok');
      geoLabel.textContent = 'Use my current location';
      geoLoc = null;
      let reason = 'Could not read location.';
      if (err.code === 1) reason = 'Permission denied.';
      else if (err.code === 2) reason = 'Position unavailable.';
      else if (err.code === 3) reason = 'Request timed out.';
      setHint(reason + ' You can still order without it.', 'err');
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
});

// Render once on load so a previously-saved cart shows up immediately.
renderCart();

/* Build WhatsApp message and open chat */
document.getElementById('btnWaOrder').addEventListener('click', () => {
  const keys = Object.keys(cart);
  if (!keys.length) return;
  if (!validateForm()) {
    setHint('Please complete the required delivery fields.', 'err');
    return;
  }

  const phone = normalizePhone(dPhone.value);

  let total = 0;
  const lines = keys.map((k, i) => {
    const { name, price, unit, qty } = cart[k];
    const lineTotal = price * qty;
    total += lineTotal;
    return `${i + 1}. ${name} (${unit}) x${qty} \u2014 \u20b9${lineTotal}`;
  }).join('\n');

  const addrParts = [
    dAddr1.value.trim(),
    dAddr2.value.trim(),
    `${dCity.value.trim()} \u2014 ${dPincode.value.trim()}`
  ].filter(Boolean);
  const addrBlock = addrParts.join('\n');

  const notes    = dNotes.value.trim();
  const notesStr = notes ? `\nNotes: ${notes}` : '';
  const geoStr   = geoLoc
    ? `\n\uD83D\uDCCD https://maps.google.com/?q=${geoLoc.lat},${geoLoc.lng}`
    : '';

  const msg =
    `\uD83D\uDED2 *New Order \u2013 KrishiDakshina*\n\n` +
    `*Customer*\n` +
    `Name : ${dName.value.trim()}\n` +
    `Phone: +91 ${phone}\n\n` +
    `*Delivery to*\n${addrBlock}${notesStr}${geoStr}\n\n` +
    `*Order*\n${lines}\n\n` +
    `*Total: \u20b9${total}*\n\n` +
    `Please confirm my order. Thank you!`;

  const encoded = encodeURIComponent(msg);
  if (encoded.length > MAX_MSG_LEN) {
    setHint('Order is too long — please shorten your delivery notes.', 'err');
    return;
  }

  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`,
    '_blank', 'noopener,noreferrer'
  );
});

/* ── Contact form (Option C: WhatsApp handoff) ──
   Constitution v2.1.0 P-V (Client-Only Architecture): no backend, no third-party
   form endpoint. Enquiries are handed off to WhatsApp using the same pattern as
   the order flow. Any migration off this handoff requires a MINOR constitution
   amendment + CSP allow-list update + declared anti-spam mechanism. */
function isPlausibleEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at <= 0 || at !== s.lastIndexOf('@')) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!local || !domain) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot >= domain.length - 2) return false;
  if (/\s/.test(s)) return false;
  return true;
}
document.getElementById('cf').addEventListener('submit', function (e) {
  e.preventDefault();

  const fn  = document.getElementById('fn').value.trim();
  const ln  = document.getElementById('ln').value.trim();
  const em  = document.getElementById('em').value.trim();
  const ph  = document.getElementById('ph').value.trim();
  const sub = document.getElementById('sub').value.trim();
  const msg = document.getElementById('msg').value.trim();

  const errEl = document.getElementById('cf-err');
  const okEl  = document.getElementById('form-ok');
  const showErr = (t) => {
    errEl.textContent = t;
    errEl.style.display = 'block';
    okEl.style.display  = 'none';
  };
  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  // Required fields
  if (!fn)  return showErr('Please enter your first name.');
  if (!em)  return showErr('Please enter your email address.');
  if (!msg) return showErr('Please write a message.');

  // Basic email shape (client-side only)
  if (!isPlausibleEmail(em)) {
    return showErr('That email does not look right — please double-check.');
  }

  // Optional phone — if supplied, must match Indian mobile pattern
  const phoneClean = ph ? normalizePhone(ph) : '';
  if (ph && !isValidPhone(ph)) {
    return showErr('Phone should be a 10-digit Indian mobile starting with 6-9.');
  }

  // Build WhatsApp message
  const nameLine = ln ? `${fn} ${ln}` : fn;
  const waMsg =
    `\uD83D\uDCAC *New Enquiry \u2013 KrishiDakshina*\n\n` +
    `*From*\n` +
    `Name : ${nameLine}\n` +
    `Email: ${em}\n` +
    (phoneClean ? `Phone: +91 ${phoneClean}\n` : '') +
    `\n*Topic*: ${sub || 'General Enquiry'}\n\n` +
    `*Message*\n${msg}`;

  const encoded = encodeURIComponent(waMsg);
  if (encoded.length > MAX_MSG_LEN) {
    return showErr('Message is too long — please shorten and try again.');
  }

  const btn = this.querySelector('.btn-send');
  btn.disabled = true;
  setBtnIcon(btn, 'fa-solid fa-spinner fa-spin');
  btn.append(' Opening WhatsApp\u2026');

  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
  let pageBackgrounded = false;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') pageBackgrounded = true;
  };
  document.addEventListener('visibilitychange', onVisibility, { passive: true });

  // Some browsers (notably Safari with security flags) may return null even when
  // the new tab opens successfully, so do not use handle truthiness as the only signal.
  const win = window.open(waUrl, '_blank', 'noopener,noreferrer');

  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibility);

    btn.disabled = false;
    setBtnIcon(btn, 'fa-brands fa-whatsapp');
    btn.append(' Send via WhatsApp');
    const opened = Boolean(win) || pageBackgrounded;
    if (opened) {
      this.reset();
      okEl.style.display = 'block';
      setTimeout(() => { okEl.style.display = 'none'; }, 6000);
    } else {
      showErr('Could not open WhatsApp. Please allow pop-ups or use the "Chat on WhatsApp" button.');
    }
  }, 300);
});

/* ── Hero particles (decorative – uses CSPRNG helper) ── */
const ptcEl = document.getElementById('ptc');
for (let i = 0; i < 20; i++) {
  const p = document.createElement('div');
  p.className = 'pt';
  const size = randFloat() * 60 + 18;
  // Direct .style properties – JS DOM writes are NOT covered by CSP style-src.
  p.style.width             = size + 'px';
  p.style.height            = size + 'px';
  p.style.left              = (randFloat() * 100) + '%';
  p.style.animationDuration = (randFloat() * 18 + 14) + 's';
  p.style.animationDelay    = (randFloat() * -20) + 's';
  p.style.opacity           = (randFloat() * 0.12 + 0.03).toFixed(3);
  ptcEl.appendChild(p);
}

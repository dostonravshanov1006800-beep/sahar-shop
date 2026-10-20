// SAHAR v6 — Cloudflare Worker: бот + API мульти-странового магазина (KV)
// Бесплатный serverless. Секреты: BOT_TOKEN, HOOK_SECRET, OWNER_IDS, WEBAPP_URL (wrangler.toml)
// Базовая валюта цен — USD; отображение конвертируется по курсам из KV "settings".

export default {
  fetch: (request, env, ctx) => handle(request, env),
};

const enc = new TextEncoder();
const buf2hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function hmacRaw(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function hmacHexKey(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return buf2hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// Валидация Telegram initData (HMAC-SHA256 по WebAppData) — на КАЖДОМ запросе
async function validateInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  const nowTs = Date.now() / 1000;
  if (!authDate || authDate > nowTs + 60 || nowTs - authDate > 86400) return null; // подпись ≤ 24 ч, из будущего не принимаем
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => k + '=' + v).join('\n');
  const secretBytes = await hmacRaw('WebAppData', botToken);
  const calc = await hmacHexKey(secretBytes, dataCheckString);
  if (calc !== hash) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch (e) { return null; }
}

const J = {
  get: async (env, k, d = null) => { const v = await env.SHOP.get(k); if (v == null) return d; try { return JSON.parse(v); } catch (e) { return d; } },
  put: async (env, k, v) => env.SHOP.put(k, JSON.stringify(v)),
  del: async (env, k) => env.SHOP.delete(k),
};

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers },
});
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- Rate limit (KV, TTL 65с) ----------
async function rateOk(env, kind, tid, max = 10) {
  const minute = Math.floor(Date.now() / 60000);
  const key = 'rl:' + kind + ':' + tid + ':' + minute;
  const v = await env.SHOP.get(key);
  const n = v ? Number(v) : 0;
  if (n >= max) return false;
  await env.SHOP.put(key, String(n + 1), { expirationTtl: 65 });
  return true;
}
const clamp = (s2, n) => Array.from(String(s2 || '')).slice(0, n).join('');

// ---------- Настройки по умолчанию (создаются при первом запуске, редактируются в админке) ----------
const DEFAULT_SETTINGS = {
  shop_open: true,
  anim: 'silk', haptic: true,
  rates: { USD: 1, RUB: 85, KZT: 520, UZS: 12700, BYN: 3.2, KGS: 87, AMD: 388, GEL: 2.7, AZN: 1.7, TJS: 10.6, MDL: 17.6 },
  markup: { RU: 0, KZ: 0, UZ: 0, BY: 0, KG: 0, AM: 0, GE: 0, AZ: 0, TJ: 0, MD: 0 },
  rounding: { USD: 1, RUB: 10, KZT: 100, UZS: 1000, BYN: 1, KGS: 10, AMD: 100, GEL: 0.5, AZN: 0.5, TJS: 5, MDL: 1 },
  countries: [
    { code: 'RU', name_ru: 'Россия', name_en: 'Russia', flag: '🇷🇺', currency: 'RUB', courier_usd: 5, postal_usd: 9, free_from_usd: 120, days: '1–3 дня' },
    { code: 'KZ', name_ru: 'Казахстан', name_en: 'Kazakhstan', flag: '🇰🇿', currency: 'KZT', courier_usd: 5, postal_usd: 8, free_from_usd: 110, days: '2–4 дня' },
    { code: 'BY', name_ru: 'Беларусь', name_en: 'Belarus', flag: '🇧🇾', currency: 'BYN', courier_usd: 4, postal_usd: 7, free_from_usd: 100, days: '2–4 дня' },
    { code: 'UZ', name_ru: 'Узбекистан', name_en: 'Uzbekistan', flag: '🇺🇿', currency: 'UZS', courier_usd: 4, postal_usd: 7, free_from_usd: 100, days: '1–2 дня' },
    { code: 'KG', name_ru: 'Кыргызстан', name_en: 'Kyrgyzstan', flag: '🇰🇬', currency: 'KGS', courier_usd: 4, postal_usd: 7, free_from_usd: 100, days: '2–3 дня' },
    { code: 'AM', name_ru: 'Армения', name_en: 'Armenia', flag: '🇦🇲', currency: 'AMD', courier_usd: 5, postal_usd: 9, free_from_usd: 120, days: '2–4 дня' },
    { code: 'GE', name_ru: 'Грузия', name_en: 'Georgia', flag: '🇬🇪', currency: 'GEL', courier_usd: 5, postal_usd: 9, free_from_usd: 120, days: '2–4 дня' },
    { code: 'AZ', name_ru: 'Азербайджан', name_en: 'Azerbaijan', flag: '🇦🇿', currency: 'AZN', courier_usd: 5, postal_usd: 9, free_from_usd: 120, days: '2–4 дня' },
    { code: 'TJ', name_ru: 'Таджикистан', name_en: 'Tajikistan', flag: '🇹🇯', currency: 'TJS', courier_usd: 5, postal_usd: 8, free_from_usd: 110, days: '2–4 дня' },
    { code: 'MD', name_ru: 'Молдова', name_en: 'Moldova', flag: '🇲🇩', currency: 'MDL', courier_usd: 5, postal_usd: 9, free_from_usd: 120, days: '3–5 дней' },
  ],
  payments: [
    { id: 'cash', title_ru: 'Наличными при получении', title_en: 'Cash on delivery', countries: ['RU','KZ','BY','UZ','KG','AM','GE','AZ','TJ','MD'], instr_ru: 'Оплата курьеру или в пункте выдачи при получении заказа.', instr_en: 'Pay the courier on delivery.', active: true },
    { id: 'card', title_ru: 'Перевод на карту', title_en: 'Card transfer', countries: ['RU','KZ','BY','UZ','KG','AM','GE','AZ','TJ','MD'], instr_ru: 'Реквизиты придут после оформления заказа. Пришлите фото чека в чат — мы подтвердим оплату.', instr_en: 'Payment details will be sent after checkout. Send us a photo of the receipt in chat.', active: true },
    { id: 'spb', title_ru: 'СБП', title_en: 'SBP (fast payments)', countries: ['RU'], instr_ru: 'Оплата по СБП — реквизиты придут после оформления заказа.', instr_en: 'SBP payment details will be sent after checkout.', active: true },
    { id: 'kaspi', title_ru: 'Kaspi перевод', title_en: 'Kaspi transfer', countries: ['KZ'], instr_ru: 'Перевод через Kaspi — реквизиты придут после оформления заказа.', instr_en: 'Kaspi transfer details will be sent after checkout.', active: true },
    { id: 'erip', title_ru: 'ЕРИП', title_en: 'ERIP', countries: ['BY'], instr_ru: 'Оплата через ЕРИП — реквизиты придут после оформления заказа.', instr_en: 'ERIP details will be sent after checkout.', active: true },
    { id: 'click', title_ru: 'Click', title_en: 'Click', countries: ['UZ'], instr_ru: 'Оплата через Click — реквизиты придут после оформления заказа.', instr_en: 'Click payment details will be sent after checkout.', active: true },
    { id: 'payme', title_ru: 'Payme', title_en: 'Payme', countries: ['UZ'], instr_ru: 'Оплата через Payme — реквизиты придут после оформления заказа.', instr_en: 'Payme payment details will be sent after checkout.', active: true },
  ],
};

async function getSettings(env) {
  const s = await J.get(env, 'settings');
  if (s) return s;
  await J.put(env, 'settings', DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

const SYM = { USD: '$', RUB: '₽', KZT: '₸', UZS: 'сўм', BYN: 'Br', KGS: 'с', AMD: '֏', GEL: '₾', AZN: '₼', TJS: 'SM', MDL: 'L' };
function fmtMoney(usd, currency, rates, rounding, markup = 0) {
  const r = rates[currency] || 1;
  let v = usd * r * (1 + (markup || 0) / 100);
  const step = rounding[currency] || 1;
  v = Math.round(v / step) * step;
  return v.toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + ' ' + (SYM[currency] || currency);
}

// ---------- Владельцы ----------
async function ownerIds(env) {
  const raw = String(env.OWNER_IDS || '').trim();
  let ids;
  if (raw.startsWith('[')) { try { ids = JSON.parse(raw); } catch (e) { ids = []; } }
  else ids = raw.split(',');
  return ids.map(x => Number(String(x).trim())).filter(x => x > 0);
}
async function isOwner(env, tid) {
  return (await ownerIds(env)).includes(Number(tid));
}

async function tgApi(env, method, body) {
  return (await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })).json();
}

// ---------- Статусы заказов ----------
const STATUSES = ['new', 'awaiting_payment', 'paid', 'confirmed', 'packing', 'shipping', 'delivered', 'cancelled', 'refunded'];
const STATUS_RU = { new: 'Новый', awaiting_payment: 'Ожидает оплату', paid: 'Оплачен', confirmed: 'Подтверждён', packing: 'Собирается', shipping: 'В доставке', delivered: 'Доставлен', cancelled: 'Отменён', refunded: 'Возврат' };
const PAY_TITLE = pm => ({ cash: 'Наличные', card: 'Перевод на карту', spb: 'СБП', kaspi: 'Kaspi', erip: 'ЕРИП', click: 'Click', payme: 'Payme' }[pm] || pm);

async function orderKb(id, status) {
  const b = (t, s) => [{ text: t, callback_data: 'ordr:' + id + ':' + s }];
  if (status === 'new') return { inline_keyboard: [[...b('✅ Подтвердить', 'confirmed'), ...b('❌ Отменить', 'cancelled')]] };
  if (status === 'awaiting_payment') return { inline_keyboard: [[...b('💰 Оплата получена', 'paid'), ...b('❌ Отменить', 'cancelled')]] };
  if (status === 'paid') return { inline_keyboard: [[...b('✅ Подтвердить', 'confirmed'), ...b('↩️ Возврат', 'refunded')]] };
  if (status === 'confirmed') return { inline_keyboard: [[...b('📦 Собирается', 'packing'), ...b('❌ Отменить', 'cancelled')]] };
  if (status === 'packing') return { inline_keyboard: [[...b('🚚 В доставку', 'shipping')]] };
  if (status === 'shipping') return { inline_keyboard: [[...b('🏁 Доставлен', 'delivered')]] };
  return null;
}
async function orderText(env, o) {
  const s = await getSettings(env);
  const cur = o.currency || 'USD';
  const items = o.items.map(i => '• ' + esc(i.name_ru) + ' ×' + i.qty).join('\n');
  const dl = o.delivery === 'courier' ? 'Курьер' : 'Почта/служба';
  return '🍬 <b>SAHAR — заказ #' + o.id + '</b>\n' + items + '\n\n🚚 Доставка: ' + dl,
    '\n\n💰 <b>' + esc(o.total_local || ('$' + o.total_usd)) + '</b>' + (cur !== 'USD' ? ' (~$' + o.total_usd + ')' : '') + ' · ' + PAY_TITLE(o.payment_method) +
    '\n📍 ' + esc([o.country_name, o.city, o.address].filter(Boolean).join(', ')) +
    (o.tracking ? '\n🔖 Трек: ' + esc(o.tracking) : '') +
    '\n👤 ' + esc(o.client_name || o.client.first_name || '') + ' · <a href="tg://user?id=' + o.client.telegram_id + '">' + o.client.telegram_id + '</a>' +
    (o.phone ? '\n📞 ' + esc(o.phone) : '') +
    (o.comment ? '\n💬 ' + esc(o.comment) : '');
}
async function notifyOwners(env, text, kb) {
  for (const oid of await ownerIds(env)) {
    await tgApi(env, 'sendMessage', { chat_id: oid, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(kb ? { reply_markup: kb } : {}) });
  }
}

// ---------- API ----------
async function handle(request, env) {
  const url = new URL(request.url);
  const p = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });

  // картинки
  const m = p.match(/^\/img\/(\d+)$/);
  if (m) {
    const rec = await J.get(env, 'img:' + m[1]);
    if (!rec) return new Response('not found', { status: 404 });
    const bin = Uint8Array.from(atob(rec.data), c => c.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': rec.mime || 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }

  if (p === '/webhook/' + (env.HOOK_SECRET || '')) {
    if (request.method !== 'POST') return json({ ok: true });
    try { await handleUpdate(env, await request.json()); } catch (e) { console.error('hook', e); }
    return json({ ok: true });
  }
  if (p === '/api/ping') return json({ ok: true, v: 6 });

  if (p.startsWith('/api/')) {
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch (e) {} }
    const initData = body.initData || url.searchParams.get('initData') || '';
    let user = null;
    if (initData) user = await validateInitData(initData, env.BOT_TOKEN);

    // ---- публичные ----
    if (p === '/api/settings' && request.method === 'GET') {
      const s = await getSettings(env);
      const cCode = url.searchParams.get('country') || '';
      const pays = (s.payments || []).filter(x => x.active !== false).map(x => cCode && x.countries.includes(cCode) ? x : { ...x, instr_ru: '', instr_en: '' });
      return json({ rates: s.rates, rounding: s.rounding, countries: s.countries, payments: pays, shop_open: s.shop_open !== false, anim: s.anim || 'silk', haptic: s.haptic !== false, v: 6 });
    }
    if (p === '/api/verify') {
      if (!user) return json({ ok: false, error: 'invalid_init' }, 403);
      return json({ ok: true, user, is_owner: await isOwner(env, user.id) });
    }
    if (p === '/api/promo' && request.method === 'GET') {
      const code = clamp(url.searchParams.get('code') || '', 30).toUpperCase();
      if (!code) return json({ ok: false }, 400);
      const promoIds = await J.get(env, 'promo_ids', []);
      for (const pid of promoIds) {
        const pr = await J.get(env, 'promo:' + pid);
        if (pr && pr.active !== false && pr.code.toUpperCase() === code) return json({ ok: true, percent: pr.percent || 0 });
      }
      return json({ ok: false }, 404);
    }
    if (p === '/api/catalog' && request.method === 'GET') {
      const catIds = await J.get(env, 'cat_ids', []);
      const categories = [];
      for (const id of catIds) { const c = await J.get(env, 'cat:' + id); if (c && !c.hidden) categories.push(c); }
      const products = [];
      for (const id of await J.get(env, 'prod_ids', [])) { const pr = await J.get(env, 'prod:' + id); if (pr && pr.is_active !== false && !pr.is_deleted) products.push(pr); }
      const banners = [];
      for (const b of await J.get(env, 'banner_ids', [])) { const bn = await J.get(env, 'banner:' + b); if (bn) banners.push(bn); }
      return json({ categories, products, banners });
    }
    if (p === '/api/order' && request.method === 'POST') {
      if (!user) return json({ ok: false, error: 'forbidden' }, 403);
      if (!(await rateOk(env, 'ord', user.id, 6))) return json({ ok: false, error: 'rate_limited' }, 429);
      const s = await getSettings(env);
      if (s.shop_open === false) return json({ ok: false, error: 'shop_closed' }, 403);
      const { items } = body;
      const name = clamp(body.name, 100), phone = clamp(body.phone, 30).replace(/[^0-9+()-\s]/g, ''), comment = clamp(body.comment, 500), country = clamp(body.country, 2).toUpperCase(), city = clamp(body.city, 60), address = clamp(body.address, 200), delivery = clamp(body.delivery, 10), payment_method = clamp(body.payment_method, 20), promo = clamp(body.promo, 30), idem_key = clamp(body.idem_key, 64), gift = body.gift || {};
      if (!Array.isArray(items) || !items.length || items.length > 50 || !phone || !country || !city || !address) return json({ ok: false, error: 'bad_request' }, 400);
      // идемпотентность: повторное нажатие не создаёт дубль
      if (idem_key) {
        const existing = await J.get(env, 'idem:' + idem_key);
        if (existing) return json({ ok: true, order_id: existing, duplicate: true });
      }
      const prodIds = await J.get(env, 'prod_ids', []);
      const orderItems = [];
      let total_usd = 0;
      for (const it of items) {
        if (!prodIds.includes(it.id)) continue;
        const qty = it.qty | 0;
        if (qty <= 0) continue;
        const prod = await J.get(env, 'prod:' + it.id);
        if (!prod || prod.is_active === false || prod.is_deleted) return json({ ok: false, error: 'product_unavailable' }, 400);
        if ((prod.stock || 0) < qty) return json({ ok: false, error: 'out_of_stock' }, 400);
        orderItems.push({ id: prod.id, name_ru: prod.name_ru, qty: Math.min(99, qty), price_usd: prod.price_usd });
        total_usd += prod.price_usd * Math.min(99, qty);
      }
      if (!orderItems.length) return json({ ok: false, error: 'empty' }, 400);
      const c = (s.countries || []).find(x => x.code === country);
      if (!c) return json({ ok: false, error: 'bad_country' }, 400);
      const pmDef = (s.payments || []).find(x => x.id === payment_method && x.active !== false);
      if (!pmDef || !pmDef.countries.includes(country)) return json({ ok: false, error: 'bad_payment' }, 400);
      // доставка
      const dType = delivery === 'postal' ? 'postal' : 'courier';
      const dPrice = dType === 'courier' ? (c.courier_usd || 0) : (c.postal_usd || 0);
      let shipping = (total_usd < (c.free_from_usd ?? Infinity)) ? dPrice : 0;
      // скоропортящиеся — только курьер
      for (const it of orderItems) {
        const prod = await J.get(env, 'prod:' + it.id);
        if (prod && prod.perishable && dType !== 'courier') return json({ ok: false, error: 'perishable_courier' }, 400);
      }
      // промокод
      let discount = 0, promoApplied = null;
      if (promo) {
        const promoIds = await J.get(env, 'promo_ids', []);
        for (const pid of promoIds) {
          const pr = await J.get(env, 'promo:' + pid);
          if (pr && pr.active !== false && pr.code.toUpperCase() === String(promo).toUpperCase()) {
            discount = Math.round(total_usd * (pr.percent || 0)) / 100; promoApplied = pr.code; break;
          }
        }
      }
      const giftPack = gift && gift.premium_pack ? 3 : 0;
      const grand_usd = Math.round((total_usd - discount + shipping + giftPack) * 100) / 100;
      let id = await J.get(env, 'next_order', 1);
      while (await J.get(env, 'order:' + id)) id++; // анти-коллизия
      const rate = s.rates[c.currency] || 1;
      const order = {
        id, client: { telegram_id: user.id, first_name: user.first_name || '', username: user.username || '' },
        client_name: name || user.first_name || '', phone, comment: comment || '',
        items: orderItems, total_usd, discount_usd: discount, shipping_usd: shipping, gift_pack_usd: giftPack, grand_usd,
        currency: c.currency, rate, total_local: fmtMoney(grand_usd, c.currency, s.rates, s.rounding, (s.markup || {})[c.code] || 0),
        country, country_name: c.name_ru, city, address, delivery: dType, payment_method: payment_method || 'cash',
        promo: promoApplied, gift: gift || null, status: payment_method === 'cash' ? 'new' : 'awaiting_payment', created_at: new Date().toISOString(),
        history: [{ status: payment_method === 'cash' ? 'new' : 'awaiting_payment', at: new Date().toISOString() }],
      };
      await J.put(env, 'order:' + id, order);
      const ids = await J.get(env, 'order_ids', []); ids.push(id); await J.put(env, 'order_ids', ids);
      await J.put(env, 'next_order', id + 1);
      if (idem_key) { await env.SHOP.put('idem:' + idem_key, String(id), { expirationTtl: 86400 }); }
      // клиентская база
      const clIds = await J.get(env, 'client_ids', []);
      if (!clIds.includes(user.id)) { clIds.push(user.id); await J.put(env, 'client_ids', clIds); }
      // списываем остатки
      for (const it of orderItems) {
        const prod = await J.get(env, 'prod:' + it.id);
        if (prod) { prod.stock = Math.max(0, (prod.stock || 0) - it.qty); await J.put(env, 'prod:' + it.id, prod); }
      }
      try { await notifyOwners(env, await orderText(env, order), await orderKb(id, order.status)); } catch (e) {}
      // подтверждение клиенту + реквизиты оплаты
      try {
        const pm = (s.payments || []).find(x => x.id === order.payment_method) || null;
        const instr = pm ? ('' + (pm.instr_ru || '')) : '';
        await tgApi(env, 'sendMessage', { chat_id: user.id, parse_mode: 'HTML',
          text: '🤍 <b>SAHAR</b> — заказ <b>#' + id + '</b> принят!\n\n' + orderItems.map(i => '• ' + esc(i.name_ru) + ' ×' + i.qty).join('\n') +
            '\n\n💰 <b>' + esc(order.total_local) + '</b>\n📍 ' + esc([c.name_ru, city, address].filter(Boolean).join(', ')) +
            (instr ? '\n\n💳 ' + esc(instr) + '\nПосле оплаты пришлите, пожалуйста, фото чека в этот чат.' : '') +
            '\n\n⏳ Статус — в разделе «Мои заказы».' });
      } catch (e) {}
      return json({ ok: true, order_id: id });
    }
    if (p === '/api/my/orders' && request.method === 'GET') {
      if (!user) return json({ ok: false, error: 'forbidden' }, 403);
      const ids = await J.get(env, 'order_ids', []);
      const out = [];
      for (const id of ids.slice().reverse()) {
        const o = await J.get(env, 'order:' + id);
        if (o && o.client.telegram_id === user.id) out.push({ id: o.id, status: o.status, total_local: o.total_local, currency: o.currency, items: o.items, created_at: o.created_at, history: o.history, tracking: o.tracking || '', delivery: o.delivery, payment_method: o.payment_method });
      }
      return json(out.slice(0, 30));
    }
    if (p === '/api/support' && request.method === 'GET') {
      if (!user) return json({ ok: false, error: 'forbidden' }, 403);
      const msgs = await J.get(env, 'msgs:' + user.id, []);
      if (new URL(request.url).searchParams.get('mark') === '1') {
        let ch = false;
        for (const m of msgs) if (m.from_admin && !m.read) { m.read = true; ch = true; }
        if (ch) await J.put(env, 'msgs:' + user.id, msgs);
      }
      return json(msgs);
    }
    if (p === '/api/support' && request.method === 'POST') {
      if (!user) return json({ ok: false, error: 'forbidden' }, 403);
      if (!(await rateOk(env, 'sup', user.id, 10))) return json({ ok: false, error: 'rate_limited' }, 429);
      const text = clamp(body.text, 2000);
      const photo_url = clamp(body.photo_url, 300);
      if ((!text || !text.trim()) && !photo_url) return json({ ok: false, error: 'empty' }, 400);
      if (photo_url && !photo_url.startsWith(url.origin + '/img/')) return json({ ok: false, error: 'bad_photo' }, 400);
      const msgs = await J.get(env, 'msgs:' + user.id, []);
      const msg = { from_admin: false, text: (text || '').slice(0, 2000), photo_url: photo_url || '', at: new Date().toISOString(), read: false };
      msgs.push(msg); await J.put(env, 'msgs:' + user.id, msgs.slice(-200));
      const clIds = await J.get(env, 'client_ids', []);
      if (!clIds.includes(user.id)) { clIds.push(user.id); await J.put(env, 'client_ids', clIds); }
      await notifyOwners(env,
        (photo_url ? '🖼 <b>Фото от клиента</b>\n' : '💬 <b>Сообщение от клиента</b>\n') + esc(text || '(фото)') + '\n👤 ' + esc(user.first_name || '') + ' · <a href="tg://user?id=' + user.id + '">' + user.id + '</a>',
        { inline_keyboard: [[{ text: '💬 Ответить', callback_data: 'rep:' + user.id }]] });
      return json({ ok: true });
    }
    if (p === '/api/upload' && request.method === 'POST') {
      if (!user) return json({ ok: false, error: 'forbidden' }, 403);
      if (!(await rateOk(env, 'up', user.id, 10))) return json({ ok: false, error: 'rate_limited' }, 429);
      const { mime } = body;
      let b64 = String(body.b64 || '').replace(/^data:image\/[a-z]+;base64,/, '');
      if (!b64) return json({ ok: false, error: 'empty' }, 400);
      if (b64.length > 600 * 1024 * 1.37) return json({ ok: false, error: 'too_large' }, 400);
      if (!/^image\/(jpeg|png|webp)$/.test(mime || '')) return json({ ok: false, error: 'bad_type' }, 400);
      const id = await J.get(env, 'next_img', 1);
      await J.put(env, 'img:' + id, { data: b64, mime });
      await J.put(env, 'next_img', id + 1);
      return json({ ok: true, url: url.origin + '/img/' + id });
    }

    // ---- только для владельцев (initData подписана + isOwner) ----
    if (p.startsWith('/api/admin/')) {
      if (!user) return json({ ok: false, error: 'forbidden' }, 403);
      if (!(await isOwner(env, user.id))) return json({ ok: false, error: 'not_owner' }, 403);

      if (p === '/api/admin/stats') {
        const ids = await J.get(env, 'order_ids', []);
        let revenue = 0, all = 0, news = 0;
        const recent = [];
        for (const id of ids.slice(-100).reverse()) {
          const o = await J.get(env, 'order:' + id); if (!o) continue;
          all++; if (o.status === 'new') news++;
          if (!['cancelled', 'refunded'].includes(o.status)) revenue += o.grand_usd || 0;
          if (recent.length < 5) recent.push({ id: o.id, client: o.client_name || o.client.first_name, total_local: o.total_local, status: o.status });
        }
        return json({ new: news, orders: all, revenue_usd: Math.round(revenue), recent, clients: (await J.get(env, 'client_ids', [])).length, shop_open: (await getSettings(env)).shop_open !== false });
      }
      if (p === '/api/admin/orders') {
        const q = String(body.query || url.searchParams.get('query') || '').toLowerCase();
        const st = String(body.status || url.searchParams.get('status') || '').toLowerCase();
        const ids = await J.get(env, 'order_ids', []);
        const out = [];
        for (const id of ids.slice().reverse()) {
          const o = await J.get(env, 'order:' + id); if (!o) continue;
          if (st && o.status !== st) continue;
          if (q && !('#' + o.id + ' ' + (o.client_name || '') + ' ' + (o.client.first_name || '') + ' ' + (o.client.username || '') + ' ' + (o.phone || '') + ' ' + (o.city || '') + ' ' + (o.tracking || '')).toLowerCase().includes(q)) continue;
          out.push({ id: o.id, client: { telegram_id: o.client.telegram_id, first_name: o.client_name || o.client.first_name, username: o.client.username }, status: o.status, total_local: o.total_local, total_usd: o.grand_usd, items: o.items, phone: o.phone, country: o.country_name, city: o.city, address: o.address, comment: o.comment, payment_method: o.payment_method, delivery: o.delivery, created_at: o.created_at, tracking: o.tracking || '', history: o.history, currency: o.currency });
          if (out.length >= 50) break;
        }
        return json(out);
      }
      if (p === '/api/admin/order' && request.method === 'POST') {
        const { id, status, tracking } = body;
        const o = await J.get(env, 'order:' + id);
        if (!o) return json({ ok: false, error: 'not_found' }, 404);
        if (tracking !== undefined) o.tracking = tracking;
        if (status && status !== o.status && STATUSES.includes(status)) {
          const wasActive = !['cancelled', 'refunded'].includes(o.status);
          const nowCancelled = ['cancelled', 'refunded'].includes(status);
          if (wasActive && nowCancelled) {
            for (const it of (o.items || [])) {
              const prod = await J.get(env, 'prod:' + it.id);
              if (prod) { prod.stock = (prod.stock || 0) + it.qty; await J.put(env, 'prod:' + it.id, prod); }
            }
          }
          o.status = status; (o.history = o.history || []).push({ status, at: new Date().toISOString() });
          try { await tgApi(env, 'sendMessage', { chat_id: o.client.telegram_id, parse_mode: 'HTML',
            text: '🤍 <b>SAHAR</b> — статус заказа <b>#' + o.id + '</b>\n\n' + STATUS_RU[status] + (status === 'shipping' && o.tracking ? '\n🔖 Трек-номер: <code>' + esc(o.tracking) + '</code>' : '') }); } catch (e) {}
        }
        await J.put(env, 'order:' + id, o);
        return json({ ok: true });
      }
      if (p === '/api/admin/products') {
        const ids = await J.get(env, 'prod_ids', []);
        const out = [], deleted = [];
        for (const id of ids) { const pr = await J.get(env, 'prod:' + id); if (!pr) continue; (pr.is_deleted ? deleted : out).push(pr); }
        const catIds = await J.get(env, 'cat_ids', []);
        const cats = [];
        for (const cid of catIds) { const c = await J.get(env, 'cat:' + cid); if (c) cats.push(c); }
        return json({ products: out, categories: cats, deleted });
      }
      if (p === '/api/admin/product' && request.method === 'POST') {
        const b = body.product || {};
        if (b.price_usd !== undefined) { const n = Number(b.price_usd); if (!isFinite(n) || n < 0) return json({ ok: false, error: 'bad_price' }, 400); b.price_usd = n; }
        if (b.old_price_usd !== undefined) { const n2 = Number(b.old_price_usd) || 0; b.old_price_usd = n2 < 0 ? 0 : n2; }
        if (b.stock !== undefined) b.stock = Math.max(0, b.stock | 0);
        if (b.id) {
          const old = await J.get(env, 'prod:' + b.id);
          if (!old) return json({ ok: false, error: 'not_found' }, 404);
          const { is_deleted, ...safe } = b;
          await J.put(env, 'prod:' + b.id, { ...old, ...safe, id: old.id });
        } else {
          if (!b.name_ru || !String(b.name_ru).trim() || b.price_usd === undefined) return json({ ok: false, error: 'bad_request' }, 400);
          const id = await J.get(env, 'next_prod', 1);
          await J.put(env, 'prod:' + id, { id, name_ru: b.name_ru, name_en: b.name_en || '', name_uz: b.name_uz || '', desc_ru: b.desc_ru || '', desc_en: b.desc_en || '', desc_uz: b.desc_uz || '', cat: b.cat || 1, price_usd: Number(b.price_usd) || 0, old_price_usd: b.old_price_usd ? Number(b.old_price_usd) : 0, weight: b.weight || '', stock: b.stock | 0, image_url: b.image_url || '', badges: b.badges || [], perishable: !!b.perishable, is_active: true, sort: b.sort | 0 });
          const ids = await J.get(env, 'prod_ids', []); ids.push(id); await J.put(env, 'prod_ids', ids);
          await J.put(env, 'next_prod', id + 1);
        }
        return json({ ok: true });
      }
      if (p === '/api/admin/product/delete' && request.method === 'POST') {
        const id = body.id;
        const pr = await J.get(env, 'prod:' + id);
        if (!pr) return json({ ok: false, error: 'not_found' }, 404);
        pr.is_deleted = true; pr.deleted_at = new Date().toISOString();
        await J.put(env, 'prod:' + id, pr);
        return json({ ok: true });
      }
      if (p === '/api/admin/product/restore' && request.method === 'POST') {
        const id = body.id;
        const pr = await J.get(env, 'prod:' + id);
        if (!pr) return json({ ok: false, error: 'not_found' }, 404);
        pr.is_deleted = false; delete pr.deleted_at;
        await J.put(env, 'prod:' + id, pr);
        return json({ ok: true });
      }
      if (p === '/api/admin/product/duplicate' && request.method === 'POST') {
        const src = await J.get(env, 'prod:' + body.id);
        if (!src) return json({ ok: false, error: 'not_found' }, 404);
        const id = await J.get(env, 'next_prod', 1);
        await J.put(env, 'prod:' + id, { ...src, id, name_ru: src.name_ru + ' (копия)', name_en: (src.name_en || '') + ' (copy)', name_uz: (src.name_uz || '') + ' (nusxa)', is_active: false, is_deleted: false });
        const ids = await J.get(env, 'prod_ids', []); ids.push(id); await J.put(env, 'prod_ids', ids);
        await J.put(env, 'next_prod', id + 1);
        return json({ ok: true, id });
      }
      if (p === '/api/admin/category' && request.method === 'POST') {
        const b = body.category || {};
        if (b.id) { const old = await J.get(env, 'cat:' + b.id); if (!old) return json({ ok: false }, 404); await J.put(env, 'cat:' + b.id, { ...old, ...b, id: old.id }); }
        else {
          const id = await J.get(env, 'next_cat', 1);
          await J.put(env, 'cat:' + id, { id, name_ru: b.name_ru || '', name_en: b.name_en || b.name_ru || '', name_uz: b.name_uz || '', hidden: false, sort: b.sort | 0 });
          const ids = await J.get(env, 'cat_ids', []); ids.push(id); await J.put(env, 'cat_ids', ids);
          await J.put(env, 'next_cat', id + 1);
        }
        return json({ ok: true });
      }
      if (p === '/api/admin/category/delete' && request.method === 'POST') {
        const id = body.id;
        await J.del(env, 'cat:' + id);
        const ids = await J.get(env, 'cat_ids', []); await J.put(env, 'cat_ids', ids.filter(x => Number(x) !== Number(id)));
        return json({ ok: true });
      }
      if (p === '/api/admin/banners') {
        const ids = await J.get(env, 'banner_ids', []);
        const out = [];
        for (const id of ids) { const b = await J.get(env, 'banner:' + id); if (b) out.push(b); }
        return json(out);
      }
      if (p === '/api/admin/banner' && request.method === 'POST') {
        const b = body.banner || {};
        if (b.id) { const old = await J.get(env, 'banner:' + b.id); if (!old) return json({ ok: false }, 404); await J.put(env, 'banner:' + b.id, { ...old, ...b, id: old.id }); }
        else {
          const id = await J.get(env, 'next_banner', 1);
          await J.put(env, 'banner:' + id, { id, image_url: b.image_url || '', title_ru: b.title_ru || '', title_en: b.title_en || '', sub_ru: b.sub_ru || '', sub_en: b.sub_en || '', link: b.link || '' });
          const ids = await J.get(env, 'banner_ids', []); ids.push(id); await J.put(env, 'banner_ids', ids);
          await J.put(env, 'next_banner', id + 1);
        }
        return json({ ok: true });
      }
      if (p === '/api/admin/banner/delete' && request.method === 'POST') {
        const id = body.id;
        await J.del(env, 'banner:' + id);
        const ids = await J.get(env, 'banner_ids', []); await J.put(env, 'banner_ids', ids.filter(x => Number(x) !== Number(id)));
        return json({ ok: true });
      }
      if (p === '/api/admin/promos') {
        const ids = await J.get(env, 'promo_ids', []);
        const out = [];
        for (const id of ids) { const pr = await J.get(env, 'promo:' + id); if (pr) out.push(pr); }
        return json(out);
      }
      if (p === '/api/admin/promo' && request.method === 'POST') {
        const b = body.promo || {};
        if (b.id) { const old = await J.get(env, 'promo:' + b.id); if (!old) return json({ ok: false }, 404); if (b.percent !== undefined) { const n = Number(b.percent); if (n > 0 && n <= 100) b.percent = n; else return json({ ok: false, error: 'bad_percent' }, 400); } await J.put(env, 'promo:' + b.id, { ...old, ...b, id: old.id }); }
        else {
          const pct = Number(b.percent);
          if (!b.code || !pct || pct <= 0 || pct > 100) return json({ ok: false, error: 'bad_request' }, 400);
          const exIds = await J.get(env, 'promo_ids', []);
          for (const eid of exIds) { const ep = await J.get(env, 'promo:' + eid); if (ep && ep.code.toUpperCase() === String(b.code).toUpperCase()) return json({ ok: false, error: 'duplicate' }, 400); }
          const id = await J.get(env, 'next_promo', 1);
          await J.put(env, 'promo:' + id, { id, code: String(b.code).toUpperCase(), percent: Number(b.percent) || 0, active: true });
          const ids = await J.get(env, 'promo_ids', []); ids.push(id); await J.put(env, 'promo_ids', ids);
          await J.put(env, 'next_promo', id + 1);
        }
        return json({ ok: true });
      }
      if (p === '/api/admin/promo/delete' && request.method === 'POST') {
        const id = body.id;
        await J.del(env, 'promo:' + id);
        const ids = await J.get(env, 'promo_ids', []); await J.put(env, 'promo_ids', ids.filter(x => Number(x) !== Number(id)));
        return json({ ok: true });
      }
      if (p === '/api/admin/clients') {
        const clIds = await J.get(env, 'client_ids', []);
        const out = [];
        for (const tid of clIds) {
          const msgs = await J.get(env, 'msgs:' + tid, []);
          let last = null, ordersN = 0, spent = 0;
          const ids = await J.get(env, 'order_ids', []);
          for (const id of ids) { const o = await J.get(env, 'order:' + id); if (o && o.client.telegram_id === tid) { ordersN++; if (!['cancelled','refunded'].includes(o.status)) spent += o.grand_usd || 0; last = o; } }
          const first = msgs.find(x => !x.from_admin) || null;
          const unread = msgs.filter(x => !x.from_admin && !x.read).length;
          const chatLast = msgs.length ? msgs[msgs.length - 1].at : '';
          const lastAt = [last ? last.created_at : '', chatLast].filter(Boolean).sort().pop() || '';
          out.push({ telegram_id: tid, first_name: (last && (last.client_name || last.client.first_name)) || (first ? 'Из чата' : ''), username: (last && last.client.username) || '', orders: ordersN, spent_usd: Math.round(spent * 100) / 100, last_at: lastAt, unread });
        }
        return json(out.sort((a, b) => (b.last_at > a.last_at ? 1 : -1)));
      }
      if (p === '/api/admin/chat') {
        const tid = body.tid || url.searchParams.get('tid');
        if (!tid) return json({ ok: false, error: 'bad_request' }, 400);
        const msgs = await J.get(env, 'msgs:' + tid, []);
        for (const m of msgs) if (!m.from_admin) m.read = true;
        await J.put(env, 'msgs:' + tid, msgs);
        return json(msgs);
      }
      if (p === '/api/admin/chat/send' && request.method === 'POST') {
        const tid = body.tid, text = clamp(body.text, 2000), photo_url = clamp(body.photo_url, 300);
        if (!tid || (!text && !photo_url)) return json({ ok: false, error: 'bad_request' }, 400);
        if (photo_url && !photo_url.startsWith(url.origin + '/img/')) return json({ ok: false, error: 'bad_photo' }, 400);
        const msgs = await J.get(env, 'msgs:' + tid, []);
        msgs.push({ from_admin: true, text: text || '', photo_url: photo_url || '', at: new Date().toISOString(), read: false });
        await J.put(env, 'msgs:' + tid, msgs.slice(-200));
        try {
          if (photo_url) await tgApi(env, 'sendPhoto', { chat_id: Number(tid), photo: photo_url, caption: '🤍 SAHAR' + (text ? '\n' + text : '') });
          else await tgApi(env, 'sendMessage', { chat_id: Number(tid), parse_mode: 'HTML', text: '🤍 <b>SAHAR</b>\n' + esc(text) });
        } catch (e) {}
        return json({ ok: true });
      }
      if (p === '/api/admin/broadcast' && request.method === 'POST') {
        const text = clamp(body.text, 3800);
        if (!text || !text.trim()) return json({ ok: false, error: 'bad_request' }, 400);
        const clIds = (await J.get(env, 'client_ids', [])).slice(0, 40); // лимит подзапросов Worker
        let sent = 0, failed = 0;
        for (const tid of clIds) {
          const r = await tgApi(env, 'sendMessage', { chat_id: tid, parse_mode: 'HTML', text: '🤍 <b>SAHAR</b>\n' + esc(text), reply_markup: { inline_keyboard: [[{ text: '🛍 Открыть магазин', web_app: { url: env.WEBAPP_URL + '?v=9' } }]] } });
          if (r && r.ok) sent++; else failed++;
        }
        return json({ ok: true, sent, failed });
      }
      if (p === '/api/admin/settings') {
        if (request.method === 'GET') return json(await getSettings(env));
        if (request.method === 'POST') {
          const cur = await getSettings(env);
          const patch = body.settings || {};
          const merged = { ...cur, ...patch };
          // защита структуры: курсы копируем, негативные/NaN отвергаем
          merged.rates = { ...cur.rates };
          if (patch.rates) for (const [k, v] of Object.entries(patch.rates)) { const n = Number(v); if (n > 0 && isFinite(n)) merged.rates[k] = n; }
          if (patch.countries) merged.countries = patch.countries.filter(c => c && c.code);
          if (patch.payments) merged.payments = patch.payments.map(p => ({ ...p, countries: Array.isArray(p.countries) ? p.countries : [] }));
          await J.put(env, 'settings', merged);
          return json({ ok: true, settings: merged });
        }
      }
      if (p === '/api/admin/upload' && request.method === 'POST') {
        const { b64, mime } = body;
        if (!b64) return json({ ok: false, error: 'empty' }, 400);
        if (b64.length > 600 * 1024 * 1.37) return json({ ok: false, error: 'too_large' }, 400);
        if (!/^image\/(jpeg|png|webp)$/.test(mime || '')) return json({ ok: false, error: 'bad_type' }, 400);
        const id = await J.get(env, 'next_img', 1);
        await J.put(env, 'img:' + id, { data: b64, mime });
        await J.put(env, 'next_img', id + 1);
        return json({ ok: true, url: url.origin + '/img/' + id });
      }
      return json({ ok: false, error: 'unknown' }, 404);
    }
    return json({ ok: false, error: 'unknown' }, 404);
  }
  return json({ ok: false }, 404);
}

// ---------- Бот ----------
async function sendOrders(env, tid, own = false) {
  const ids = await J.get(env, 'order_ids', []);
  const list = [];
  for (const id of ids.slice(-20).reverse()) {
    const o = await J.get(env, 'order:' + id);
    if (!o) continue;
    if (own && String(o.client.telegram_id) !== String(tid)) continue;
    list.push('#' + o.id + ' · ' + STATUS_RU[o.status] + ' · ' + (o.total_local || ('$' + o.grand_usd)) + (own ? '' : ' · ' + esc(o.client_name || o.client.first_name || '')) + (own && o.tracking ? ' · 📍' + esc(o.tracking) : ''));
    if (list.length >= 5) break;
  }
  await tgApi(env, 'sendMessage', { chat_id: tid, parse_mode: 'HTML', text: list.length ? (own ? '<b>Ваши заказы</b>\n\n' : '<b>Последние заказы</b>\n\n') + list.join('\n') : (own ? 'У вас пока нет заказов. Откройте магазин и выберите сладости 🍫' : 'Заказов пока нет.') });
}

async function handleUpdate(env, u) {
  if (u.message) {
    const m = u.message, tid = m.from.id;
    if (await isOwner(env, tid)) {
      if (m.text && m.text.startsWith('/')) { const pr2 = await J.get(env, 'pending_reply:' + tid); if (pr2) await J.del(env, 'pending_reply:' + tid); }
      if (m.text && m.text.startsWith('/start')) {
        await tgApi(env, 'sendMessage', { chat_id: tid, parse_mode: 'HTML',
          text: '👑 <b>SAHAR — панель владельца</b>\n\n🆔 Ваш Telegram ID: <code>' + tid + '</code>\n/orders — последние заказы\nЛюбое сообщение покупателя приходит сюда.',
          reply_markup: { inline_keyboard: [
            [{ text: '🛍 Открыть магазин', web_app: { url: env.WEBAPP_URL + '?v=9' } }],
            [{ text: '🎛 Админ-панель', web_app: { url: env.WEBAPP_URL + 'admin.html?v=9' } }],
          ] } });
        await tgApi(env, 'setChatMenuButton', { chat_id: tid, menu_button: { type: 'web_app', text: '🛍 Магазин', web_app: { url: env.WEBAPP_URL + '?v=9' } } });
        return;
      }
      if (m.text && m.text.startsWith('/orders')) { await sendOrders(env, tid, false); return; }
      const pr = await J.get(env, 'pending_reply:' + tid);
      if (pr && m.text && m.text.startsWith('/')) { await J.del(env, 'pending_reply:' + tid); await tgApi(env, 'sendMessage', { chat_id: tid, text: 'ℹ️ Режим ответа отменён. Команды: /orders — последние заказы.' }); return; }
      if (pr) {
        const rtxt = m.text || m.caption || '';
        if (!rtxt && !m.photo) { await tgApi(env, 'sendMessage', { chat_id: tid, text: '⚠️ Отправьте текст или фото — ответ уйдёт покупателю. Или /orders для отмены режима.' }); return; }
        await J.del(env, 'pending_reply:' + tid);
        const msgs = await J.get(env, 'msgs:' + pr, []);
        msgs.push({ from_admin: true, text: clamp(rtxt, 2000), at: new Date().toISOString(), read: false });
        await J.put(env, 'msgs:' + pr, msgs.slice(-200));
        if (m.photo) {
          const fid = m.photo[m.photo.length - 1].file_id;
          await tgApi(env, 'sendPhoto', { chat_id: pr, photo: fid, caption: clamp('🤍 SAHAR' + (rtxt ? '\n' + rtxt : ''), 1000) });
        } else if (rtxt) {
          await tgApi(env, 'sendMessage', { chat_id: pr, parse_mode: 'HTML', text: '🤍 <b>SAHAR</b>\n' + esc(rtxt) });
        }
        await tgApi(env, 'sendMessage', { chat_id: tid, text: '✅ Ответ отправлен покупателю.' });
        return;
      }
      await tgApi(env, 'sendMessage', { chat_id: tid, text: 'ℹ️ Команды: /orders — последние заказы. Для ответа клиенту используйте кнопку 💬 Ответить из уведомления.' });
      return;
    }
    // клиент
    if (m.text && m.text.startsWith('/orders')) { await sendOrders(env, tid, true); return; }
    if (m.text && m.text.startsWith('/start')) {
      await tgApi(env, 'sendMessage', { chat_id: tid, parse_mode: 'HTML',
        text: 'Добро пожаловать в <b>SAHAR</b> ✦\nАвторские сладости ручной работы: трюфели, шоколад, восточные десерты и подарочные наборы.\n\nДоставка по странам СНГ. Откройте магазин и закажите за пару касаний.',
        reply_markup: { inline_keyboard: [[{ text: '🛍 Открыть магазин', web_app: { url: env.WEBAPP_URL + '?v=9' } }]] } });
      await tgApi(env, 'setChatMenuButton', { chat_id: tid, menu_button: { type: 'web_app', text: '🛍 Магазин', web_app: { url: env.WEBAPP_URL + '?v=9' } } });
      return;
    }
    if (m.contact) {
      const clIds2 = await J.get(env, 'client_ids', []);
      if (!clIds2.includes(tid)) { clIds2.push(tid); await J.put(env, 'client_ids', clIds2); }
      const phoneTxt = '📞 Телефон из Telegram: ' + (m.contact.phone_number || '—');
      const msgs = await J.get(env, 'msgs:' + tid, []);
      msgs.push({ from_admin: false, text: phoneTxt, at: new Date().toISOString(), read: false });
      await J.put(env, 'msgs:' + tid, msgs.slice(-200));
      await notifyOwners(env, '📞 <b>Клиент поделился номером</b>\n👤 ' + esc(m.from.first_name || '') + ' · <a href="tg://user?id=' + tid + '">' + tid + '</a>\n📱 <code>' + esc(m.contact.phone_number || '') + '</code>',
        { inline_keyboard: [[{ text: '💬 Ответить', callback_data: 'rep:' + tid }]] });
      return;
    }
    // сообщение поддержки
    const clIds = await J.get(env, 'client_ids', []);
    if (!clIds.includes(tid)) { clIds.push(tid); await J.put(env, 'client_ids', clIds); }
    const msgs = await J.get(env, 'msgs:' + tid, []);
    const msgText = clamp(m.text || m.caption || '', 2000);
    msgs.push({ from_admin: false, text: msgText, at: new Date().toISOString(), read: false });
    await J.put(env, 'msgs:' + tid, msgs.slice(-200));
    if (m.photo) {
      const fid = m.photo[m.photo.length - 1].file_id;
      for (const oid of await ownerIds(env)) {
        try { await tgApi(env, 'sendPhoto', { chat_id: oid, photo: fid, caption: '🖼 <b>Фото от клиента</b>' + (msgText ? '\n' + esc(msgText) : '') + '\n👤 ' + esc(m.from.first_name || '') + ' · <a href="tg://user?id=' + tid + '">' + tid + '</a>', parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '💬 Ответить', callback_data: 'rep:' + tid }]] } }); } catch (e) {}
      }
    } else {
      await notifyOwners(env,
        '💬 <b>Сообщение от клиента</b>\n' + esc(msgText || '(вложение)') + '\n👤 ' + esc(m.from.first_name || '') + ' · <a href="tg://user?id=' + tid + '">' + tid + '</a>',
        { inline_keyboard: [[{ text: '💬 Ответить', callback_data: 'rep:' + tid }]] });
    }
    await tgApi(env, 'sendMessage', { chat_id: tid, text: '✅ Сообщение отправлено. Мы ответим здесь и в разделе «Сообщения» магазина.', reply_markup: { inline_keyboard: [[{ text: '🛍 Открыть магазин', web_app: { url: env.WEBAPP_URL + '?v=9' } }]] } });
    return;
  }
  if (u.callback_query) {
    const cb = u.callback_query, tid = cb.from.id, d = cb.data || '';
    let cbText = '';
    try {
      if (d.startsWith('rep:') && await isOwner(env, tid)) {
        const target = Number(d.slice(4));
        await J.put(env, 'pending_reply:' + tid, target);
        await tgApi(env, 'sendMessage', { chat_id: tid, text: '✍️ Напишите ответ — он уйдёт покупателю (текст или фото). /orders — отмена режима.' });
        cbText = 'Режим ответа включён';
      } else if (d.startsWith('ordr:') && await isOwner(env, tid)) {
        const [, id, status] = d.split(':');
        const o = await J.get(env, 'order:' + id);
        if (o && STATUSES.includes(status)) {
          const wasActive = !['cancelled', 'refunded'].includes(o.status);
          const nowCancelled = ['cancelled', 'refunded'].includes(status);
          if (wasActive && nowCancelled) {
            for (const it of (o.items || [])) {
              const prod = await J.get(env, 'prod:' + it.id);
              if (prod) { prod.stock = (prod.stock || 0) + it.qty; await J.put(env, 'prod:' + it.id, prod); }
            }
          }
          o.status = status; (o.history = o.history || []).push({ status, at: new Date().toISOString() });
          await J.put(env, 'order:' + id, o);
          try { await tgApi(env, 'sendMessage', { chat_id: o.client.telegram_id, parse_mode: 'HTML', text: '🤍 <b>SAHAR</b> — статус заказа <b>#' + o.id + '</b>\n\n' + STATUS_RU[status] + (status === 'shipping' && o.tracking ? '\n🔖 Трек-номер: <code>' + esc(o.tracking) + '</code>' : '') }); } catch (e) {}
          try { if (cb.message) await tgApi(env, 'editMessageReplyMarkup', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: (await orderKb(id, status)) || { inline_keyboard: [] } }); } catch (e) {}
          cbText = 'Статус #' + id + ': ' + STATUS_RU[status];
        } else cbText = 'Заказ не найден';
      }
    } catch (e) { cbText = 'Ошибка, попробуйте ещё раз'; }
    try { await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id, ...(cbText ? { text: cbText } : {}) }); } catch (e) {}
  }
}

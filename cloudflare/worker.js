// SAHAR — Cloudflare Worker: бот + API магазина + заказы (KV)
// Бесплатный serverless-хостинг. Настройки в wrangler.toml.

export default {
  fetch: (request, env, ctx) => handle(request, env),
};

const enc = new TextEncoder();
const buf2hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return buf2hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function hmacRaw(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
async function hmacHexKey(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return buf2hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// Валидация Telegram initData (HMAC-SHA256 по WebAppData)
async function validateInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => k + '=' + v).join('\n');
  const secretBytes = await hmacRaw('WebAppData', botToken);  // ключ = HMAC(msg=токен, key='WebAppData')
  const calc = await hmacHexKey(secretBytes, dataCheckString);
  if (calc !== hash) return null;
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (e) {}
  return user;
}

const J = {
  get: async (shop, k, d = null) => { const v = await shop.get(k); return v ? JSON.parse(v) : d; },
  put: (shop, k, v) => shop.put(k, JSON.stringify(v)),
};

// ---------- данные каталога (первый запуск) ----------
const SEED_CATEGORIES = [
  { id: 1, name_ru: 'Шоколад ручной работы', name_uz: "Qo'lda yasalgan shokolad" },
  { id: 2, name_ru: 'Конфеты', name_uz: 'Konfetlar' },
  { id: 3, name_ru: 'Зефир и маршмеллоу', name_uz: 'Zefir va marshmallow' },
  { id: 4, name_ru: 'Подарочные наборы', name_uz: "Sovg'a to'plamlari" },
];
const IMG = i => 'https://thumb.wikimedia.org/wikipedia/commons/thumb/' + i;
const SEED_PRODUCTS = [
  { id: 1, category_id: 1, name_ru: 'Трюфели «Чёрный бархат»', name_uz: '«Qora baxmal» trüfillari',
    desc_ru: 'Бельгийский тёмный шоколад 72% с какао-кремом. 12 шт в бархатной коробке.',
    desc_uz: 'Belgiya qora shokoladi 72%, kakao-krem. 12 dona baxmat qutida.',
    price: 189000, old_price: 0, stock: 24, is_active: true,
    image_url: IMG('6/63/Chocolate_truffle_-_Godiva_01.jpg/960px-Chocolate_truffle_-_Godiva_01.jpg') },
  { id: 2, category_id: 1, name_ru: 'Клубника в белом шоколаде', name_uz: 'Oq shokoladli qulupnay',
    desc_ru: 'Свежая клубника в бельгийском белом шоколаде. 9 шт.',
    desc_uz: 'Yangi qulupnay, belgiya oq shokoladida. 9 dona.',
    price: 149000, old_price: 179000, stock: 15, is_active: true,
    image_url: IMG('3/34/020260501_Chocolate-covered_strawberries.jpg/960px-020260501_Chocolate-covered_strawberries.jpg') },
  { id: 3, category_id: 1, name_ru: '«SAHAR Gold» — премиальная плитка', name_uz: '«SAHAR Gold» — premium plitka',
    desc_ru: 'Гранд-крю какао из Эквадора, 85%. Съедобная золотая пыль.',
    desc_uz: 'Ekvador grand-cru kakao, 85%. Yes ov qiladigan oltin chang.',
    price: 95000, old_price: 0, stock: 30, is_active: true,
    image_url: IMG("5/5f/Green_and_Black%27s_dark_chocolate_bar_1.jpg/960px-Green_and_Black%27s_dark_chocolate_bar_1.jpg") },
  { id: 4, category_id: 2, name_ru: 'Рахат-лукум «Роза Востока»', name_uz: '«Sharq guli» rahat-lukumi',
    desc_ru: 'Классический рахат-лукум с лепестками розы, обсыпка сахарной пудрой.',
    desc_uz: 'Klassik rahat-lukum, atirgul barglari bilan.',
    price: 69000, old_price: 0, stock: 40, is_active: true,
    image_url: IMG('d/d3/Lokum_%28Turkish_Delight%29.jpg/960px-Lokum_%28Turkish_Delight%29.jpg') },
  { id: 5, category_id: 2, name_ru: 'Птичье молоко ассорти', name_uz: 'Qush suti assorti',
    desc_ru: 'Суфле-конфеты в белом и тёмном шоколаде, 16 шт.',
    desc_uz: 'Sufle-konfetlar oq va qora shokoladda, 16 dona.',
    price: 129000, old_price: 159000, stock: 20, is_active: true,
    image_url: IMG('5/51/Black_truffle_bonbon_%2815253151973%29.jpg/960px-Black_truffle_bonbon_%2815253151973%29.jpg') },
  { id: 6, category_id: 2, name_ru: 'Клюква в шоколаде', name_uz: 'Shokoladli klyukva',
    desc_ru: 'Сушёная клюква в тёмном шоколаде — терпкая классика.',
    desc_uz: 'Quritilgan klyukva qora shokoladda.',
    price: 79000, old_price: 0, stock: 35, is_active: true,
    image_url: IMG('c/c1/Chocolate_truffle_-_Delacre.jpg/960px-Chocolate_truffle_-_Delacre.jpg') },
  { id: 7, category_id: 3, name_ru: 'Зефир «Ванильное облако»', name_uz: '«Vanil buluti» zefiri',
    desc_ru: 'Воздушный зефир на натуральном агаре, ваниль Bourbon.',
    desc_uz: 'Yengil zefir, tabiiy agar, Bourbon vanil.',
    price: 55000, old_price: 0, stock: 50, is_active: true,
    image_url: IMG('7/75/Homemade_white_marshmallows.jpg/960px-Homemade_white_marshmallows.jpg') },
  { id: 8, category_id: 3, name_ru: 'Маршмеллоу «Карамель»', name_uz: '«Karamel» marshmallow',
    desc_ru: 'Жевательный маршмеллоу со вкусом солёной карамели.',
    desc_uz: 'Tuzli karamel tamli marshmallow.',
    price: 59000, old_price: 69000, stock: 45, is_active: true,
    image_url: IMG('4/46/Assorter_berliner_marshmallows.jpg/960px-Assorter_berliner_marshmallows.jpg') },
  { id: 9, category_id: 4, name_ru: 'Набор «Праздник» — большая коробка', name_uz: "«Bayram» to'plami — katta quti",
    desc_ru: '30 конфет: трюфели, суфле, ореховые. Готовая подарочная упаковка с лентой.',
    desc_uz: "30 dona: trüfel, sufle, yong'oqli. Tayyor sovg'a qadoqda.",
    price: 349000, old_price: 399000, stock: 10, is_active: true,
    image_url: IMG('6/6b/Box_of_Valentine_Chocolates.JPG/960px-Box_of_Valentine_Chocolates.JPG') },
  { id: 10, category_id: 4, name_ru: 'Набор «Дорогому человеку»', name_uz: '«Sevgan insonga» to\'plami',
    desc_ru: 'Элитные трюфели + клубника в шоколаде в чёрной коробке SAHAR.',
    desc_uz: 'Elit trüfel + shokoladli qulupnay, SAHAR qora qutisida.',
    price: 279000, old_price: 0, stock: 12, is_active: true,
    image_url: IMG('8/8f/Chocolate_Truffles_at_Harrods_in_London_by_Robbie_Conceptuel.png/960px-Chocolate_Truffles_at_Harrods_in_London_by_Robbie_Conceptuel.png') },
];

async function ensureSeed(env) {
  const seeded = await env.SHOP.get('seeded');
  if (seeded) return;
  await J.put(env.SHOP, 'cat_ids', SEED_CATEGORIES.map(c => c.id));
  for (const c of SEED_CATEGORIES) await J.put(env.SHOP, 'cat:' + c.id, c);
  await J.put(env.SHOP, 'prod_ids', SEED_PRODUCTS.map(p => p.id));
  for (const p of SEED_PRODUCTS) await J.put(env.SHOP, 'prod:' + p.id, p);
  await J.put(env.SHOP, 'next_order', 1);
  await env.SHOP.put('seeded', '1');
}

async function getCatalog(env, all) {
  await ensureSeed(env);
  const ids = await J.get(env.SHOP, 'prod_ids', []);
  const products = [];
  for (const id of ids) {
    const p = await J.get(env.SHOP, 'prod:' + id);
    if (p && (all || p.is_active !== false)) products.push(p);
  }
  const catIds = await J.get(env.SHOP, 'cat_ids', []);
  const categories = [];
  for (const id of catIds) {
    const c = await J.get(env.SHOP, 'cat:' + id);
    if (c) categories.push(c);
  }
  return { categories, products };
}

// ---------- Telegram ----------
async function tgApi(env, method, body) {
  return (await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })).json();
}
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = n => (n || 0).toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + ' сум';
const STATUS_RU = { new: 'Новый', accepted: 'Принят', delivering: 'В доставке', done: 'Завершён', cancelled: 'Отменён' };

async function ownerIds(env) {
  try { return JSON.parse(env.OWNER_IDS || '[]').map(Number); } catch (e) { return []; }
}
const isOwner = async (env, tid) => (await ownerIds(env)).includes(Number(tid));

async function notifyOwners(env, text, kb) {
  for (const oid of await ownerIds(env)) {
    await tgApi(env, 'sendMessage', { chat_id: oid, text, parse_mode: 'HTML', ...(kb ? { reply_markup: kb } : {}) });
  }
}

async function orderKb(id, status) {
  if (status === 'new') return { inline_keyboard: [[
    { text: '✅ Принять', callback_data: 'ordr:' + id + ':accepted' },
    { text: '❌ Отменить', callback_data: 'ordr:' + id + ':cancelled' }]] };
  if (status === 'accepted') return { inline_keyboard: [[
    { text: '🚚 В доставку', callback_data: 'ordr:' + id + ':delivering' },
    { text: '🏁 Выполнен', callback_data: 'ordr:' + id + ':done' }]] };
  if (status === 'delivering') return { inline_keyboard: [[
    { text: '🏁 Доставлен', callback_data: 'ordr:' + id + ':done' }]] };
  return null;
}

async function orderText(o) {
  const items = o.items.map(i => '• ' + esc(i.name_ru) + ' ×' + i.qty).join('\n');
  const pay = { cash: 'Наличные', card: 'Карта', click: 'Click', payme: 'Payme' }[o.payment_method] || o.payment_method;
  return '🍬 <b>Новый заказ #' + o.id + '</b>\n' + items + '\n\n' +
    '💰 <b>' + money(o.total) + '</b> · ' + pay + '\n📍 ' + esc(o.address) + '\n📞 ' + esc(o.phone) +
    (o.comment ? '\n💬 ' + esc(o.comment) : '') + '\n👤 ' + esc(o.client.first_name || '') + ' · ' + o.client.telegram_id;
}


// ---------- Bot: обновления ----------
async function handleUpdate(env, u) {
  if (u.message) {
    const m = u.message, tid = m.from.id;
    if (await isOwner(env, tid)) {
      if (m.text === '/start') {
        await tgApi(env, 'sendMessage', { chat_id: tid, parse_mode: 'HTML', text:
          '👑 <b>SAHAR — панель владельца</b>\n\n🆔 Ваш Telegram ID: <code>' + tid + '</code>\n/orders — последние заказы\nЛюбое сообщение покупателя приходит сюда.',
          reply_markup: { inline_keyboard: [
            [{ text: '🛍 Открыть магазин', web_app: { url: env.WEBAPP_URL + '?v=4' } }],
            [{ text: '🎛 Админ-панель', web_app: { url: env.WEBAPP_URL + 'admin.html?v=4' } }]
          ] } });
        await tgApi(env, 'setChatMenuButton', { chat_id: tid, menu_button: { type: 'web_app', text: '🛍 Магазин', web_app: { url: env.WEBAPP_URL + '?v=4' } } });
        return;
      }
      if (m.text === '/orders') return void await sendOrders(env, tid);
      const target = await J.get(env.SHOP, 'pending_reply:' + tid);
      if (target) {
        await J.put(env.SHOP, 'pending_reply:' + tid, null);
        await addMsg(env, target, m.text, true);
        await tgApi(env, 'sendMessage', { chat_id: target, parse_mode: 'HTML',
          text: '👑 <b>SAHAR:</b> ' + esc(m.text) });
        await tgApi(env, 'sendMessage', { chat_id: tid, text: '✅ Ответ доставлен.' });
        return;
      }
      await tgApi(env, 'sendMessage', { chat_id: tid, text: 'Нажмите «Ответить» под сообщением покупателя, чтобы написать ему. /orders — заказы.' });
      return;
    }
    // покупатель
    if (m.text === '/start') {
      await tgApi(env, 'sendMessage', { chat_id: tid, parse_mode: 'HTML',
        text: '🤍 <b>SAHAR</b> · премиальные сладости\nРучная работа · Доставка по СНГ\n\nНажмите кнопку и закажите с доставкой.',
        reply_markup: { inline_keyboard: [[{ text: '🛍 Открыть магазин', web_app: { url: env.WEBAPP_URL + '?v=4' } }]] } });
      await tgApi(env, 'setChatMenuButton', { chat_id: tid, menu_button: { type: 'web_app', text: '🛍 Магазин', web_app: { url: env.WEBAPP_URL + '?v=4' } } });
      return;
    }
    if (m.text) {
      await addMsg(env, tid, m.text, false);
      const uname = m.from.username ? '@' + m.from.username : 'id ' + tid;
      await notifyOwners(env, '💬 <b>Сообщение от ' + esc(m.from.first_name || '') + '</b> (' + esc(uname) + '):\n' + esc(m.text),
        { inline_keyboard: [[{ text: '💬 Ответить', callback_data: 'rep:' + tid }]] });
    }
    return;
  }
  if (u.callback_query) {
    const cb = u.callback_query, tid = cb.from.id, d = cb.data || '';
    if (d.startsWith('rep:') && await isOwner(env, tid)) {
      await J.put(env.SHOP, 'pending_reply:' + tid, Number(d.slice(4)));
      await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tgApi(env, 'sendMessage', { chat_id: tid, text: '✍️ Напишите ответ — он уйдёт покупателю.' });
      return;
    }
    if (d.startsWith('ordr:') && await isOwner(env, tid)) {
      const [, id, status] = d.split(':');
      const o = await J.get(env.SHOP, 'order:' + id);
      if (o) {
        o.status = status;
        await J.put(env.SHOP, 'order:' + id, o);
        const kb = await orderKb(Number(id), status);
        await tgApi(env, 'editMessageReplyMarkup', { chat_id: tid, message_id: cb.message.message_id, ...(kb ? { reply_markup: kb } : { reply_markup: { inline_keyboard: [] } }) });
        await tgApi(env, 'sendMessage', { chat_id: o.client.telegram_id, parse_mode: 'HTML',
          text: '🍬 <b>SAHAR</b>\nВаш заказ #' + o.id + ': <b>' + STATUS_RU[status] + '</b>' });
      }
      await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      return;
    }
    await tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id });
  }
}

async function sendOrders(env, tid) {
  const ids = (await J.get(env.SHOP, 'order_ids', [])).slice(-10).reverse();
  for (const id of ids) {
    const o = await J.get(env.SHOP, 'order:' + id);
    if (!o) continue;
    const kb = await orderKb(id, o.status);
    await tgApi(env, 'sendMessage', { chat_id: tid, parse_mode: 'HTML',
      text: 'Заказ #' + o.id + ' · ' + STATUS_RU[o.status] + ' · ' + money(o.total) + '\n📞 ' + esc(o.phone) + '\n📍 ' + esc(o.address),
      ...(kb ? { reply_markup: kb } : {}) });
  }
}

// ---------- поддержка ----------
async function addMsg(env, tid, text, fromAdmin) {
  const now = Date.now();
  await J.put(env.SHOP, 'msg:' + tid + ':' + now, { from_admin: fromAdmin, text, at: now });
  const keys = await J.get(env.SHOP, 'msgs:' + tid, []);
  keys.push('msg:' + tid + ':' + now);
  await J.put(env.SHOP, 'msgs:' + tid, keys.slice(-100));
}
async function thread(env, tid) {
  const keys = await J.get(env.SHOP, 'msgs:' + tid, []);
  const out = [];
  for (const k of keys) { const m = await J.get(env.SHOP, k); if (m) out.push(m); }
  return out;
}

// ---------- HTTP ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  const url = new URL(request.url);
  const p = url.pathname;

  if (p === '/webhook/' + (env.HOOK_SECRET || '')) {
    if (request.method !== 'POST') return new Response('not found', { status: 404 });
    const u = await request.json();
    await handleUpdate(env, u);
    return new Response('ok');
  }
  if (p === '/ping') return json({ ok: true });

  // раздача загруженных фото товаров
  const im = p.match(/^\/img\/(\d+)$/);
  if (im) {
    const buf = await env.SHOP.get('img:' + im[1], 'arrayBuffer');
    if (!buf) return new Response(null, { status: 404 });
    return new Response(buf, { headers: { 'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*' } });
  }

  if (!p.startsWith('/api/')) return new Response('SAHAR API', { status: 404, headers: CORS });

  if (p === '/api/catalog' && request.method === 'GET') {
    const cat = await getCatalog(env, false);
    return json(cat);
  }

  // ---- ниже нужна аутентификация ----
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const initData = body.initData || url.searchParams.get('initData') || '';
  const user = await validateInitData(initData, env.BOT_TOKEN);
  if (!user) return json({ error: 'unauthorized' }, 401);

  if (p === '/api/verify' && request.method === 'POST') {
    return json({ ok: true, is_admin: await isOwner(env, user.id),
      user: { telegram_id: user.id, first_name: user.first_name || '', username: user.username || '' } });
  }

  if (p === '/api/order' && request.method === 'POST') {
    const { items, address, phone, comment, payment_method } = body;
    if (!Array.isArray(items) || !items.length || !address || !phone) return json({ error: 'bad_request' }, 400);
    const cat = await getCatalog(env, false);
    const orderItems = [];
    let total = 0;
    for (const it of items) {
      const prod = cat.products.find(x => x.id === it.id);
      if (!prod) continue;
      orderItems.push({ id: prod.id, name_ru: prod.name_ru, name_uz: prod.name_uz, price: prod.price, qty: it.qty });
      total += prod.price * it.qty;
    }
    if (!orderItems.length) return json({ error: 'empty' }, 400);
    const id = await J.get(env.SHOP, 'next_order', 1);
    const order = { id, client: { telegram_id: user.id, first_name: user.first_name || '', username: user.username || '' },
      items: orderItems, total, address, phone, comment: comment || '',
      payment_method: payment_method || 'cash', status: 'new', created_at: new Date().toISOString() };
    await J.put(env.SHOP, 'order:' + id, order);
    const ids = await J.get(env.SHOP, 'order_ids', []);
    ids.push(id);
    await J.put(env.SHOP, 'order_ids', ids.slice(-500));
    await J.put(env.SHOP, 'next_order', id + 1);
    // списываем остатки
    for (const it of orderItems) {
      const prod = await J.get(env.SHOP, 'prod:' + it.id);
      if (prod) { prod.stock = Math.max(0, (prod.stock || 0) - it.qty); await J.put(env.SHOP, 'prod:' + it.id, prod); }
    }
    await notifyOwners(env, await orderText(order), await orderKb(id, 'new'));
    return json({ order_id: id, total });
  }

  if (p === '/api/my/orders' && request.method === 'GET') {
    const ids = await J.get(env.SHOP, 'order_ids', []);
    const mine = [];
    for (const id of ids) {
      const o = await J.get(env.SHOP, 'order:' + id);
      if (o && o.client.telegram_id === user.id) mine.push(o);
    }
    return json(mine.reverse());
  }

  if (p === '/api/support') {
    if (request.method === 'POST') {
      await addMsg(env, user.id, String(body.text || '').slice(0, 2000), false);
      const uname = user.username ? '@' + user.username : 'id ' + user.id;
      await notifyOwners(env, '💬 <b>Сообщение от ' + esc(user.first_name || '') + '</b> (' + esc(uname) + '):\n' + esc(body.text),
        { inline_keyboard: [[{ text: '💬 Ответить', callback_data: 'rep:' + user.id }]] });
      return json({ ok: true });
    }
    return json(await thread(env, user.id));
  }

  // ---- админ ----
  if (!(await isOwner(env, user.id))) return json({ error: 'forbidden' }, 403);

  if (p === '/api/admin/upload' && request.method === 'POST') {
    const b64 = String(body.img || '').replace(/^data:image\/\w+;base64,/, '');
    let buf;
    try { buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch { return json({ error: 'bad_image' }, 400); }
    if (!buf.length || buf.length > 600000) return json({ error: 'bad_size' }, 400);
    const id = await J.get(env.SHOP, 'next_img', 1);
    await env.SHOP.put('img:' + id, buf);
    await J.put(env.SHOP, 'next_img', id + 1);
    return json({ ok: true, url: new URL(request.url).origin + '/img/' + id });
  }
  if (p === '/api/admin/orders' && request.method === 'GET') {
    const ids = await J.get(env.SHOP, 'order_ids', []);
    const orders = [];
    for (const id of ids) { const o = await J.get(env.SHOP, 'order:' + id); if (o) orders.push(o); }
    return json(orders.reverse());
  }

  if (p === '/api/admin/order' && request.method === 'POST') {
    const o = await J.get(env.SHOP, 'order:' + body.order_id);
    if (!o) return json({ error: 'not_found' }, 404);
    o.status = body.status;
    await J.put(env.SHOP, 'order:' + body.order_id, o);
    await tgApi(env, 'sendMessage', { chat_id: o.client.telegram_id, parse_mode: 'HTML',
      text: '🍬 <b>SAHAR</b>\nВаш заказ #' + o.id + ': <b>' + STATUS_RU[o.status] + '</b>' });
    return json({ ok: true });
  }

  if (p === '/api/admin/product' && request.method === 'POST') {
    await ensureSeed(env);
    const b = body.product || {};
    if (b.id) {
      const existing = await J.get(env.SHOP, 'prod:' + b.id);
      if (!existing) return json({ error: 'not_found' }, 404);
      await J.put(env.SHOP, 'prod:' + b.id, { ...existing, ...b });
      return json({ ok: true });
    }
    if (!b.name_ru || b.price === undefined || b.price === null) return json({ error: 'bad_request' }, 400);
    const ids = await J.get(env.SHOP, 'prod_ids', []);
    const id = Math.max(0, ...ids) + 1;
    await J.put(env.SHOP, 'prod:' + id, { id, category_id: b.category_id || 1,
      name_ru: b.name_ru, name_uz: b.name_uz || b.name_ru, desc_ru: b.desc_ru || '', desc_uz: b.desc_uz || '',
      price: b.price, old_price: b.old_price || 0, stock: b.stock || 0,
      is_active: b.is_active !== false, image_url: b.image_url || '' });
    ids.push(id);
    await J.put(env.SHOP, 'prod_ids', ids);
    return json({ ok: true, id });
  }

  if (p === '/api/products' && request.method === 'GET') {
    return json((await getCatalog(env, true)).products);
  }

  return json({ error: 'not_found' }, 404);
}

// Lead guard for MyPrice forms (Vercel serverless function).
// Spec: "אפיון: מניעת ספאם בטפסי MyPrice באתרי לקוחות" (16/11/2026), ported from the WordPress
// "YC Lead Guard" to Vercel. The browser posts here; only a valid lead is forwarded to MyPrice.

// ---- Per-site settings (the only part that changes between sites) ----
const YC_MYPRICE_URL = 'https://www.myprice.co.il/myprice/ajax/affiliate_service_submit.ashx';
const YC_MYPRICE_FORM_PAGE = 'https://www.myprice.co.il/myprice/affiliate_service.aspx?tid=274&fk_service_id=10310&fk_affiliate_id=21126171';
const YC_MYPRICE_AFFILIATE = '21126171';
const YC_MYPRICE_SERVICE = '10310';
const YC_FIELDS = { name: 'txt_form_field_11623', phone: 'txt_form_field_11624', email: 'txt_form_field_11625', msg: 'txt_form_field_11626' };
const YC_REQUIRED = ['name', 'phone'];
const YC_IP_MAX = 2;
const YC_IP_WINDOW = 3600; // seconds
const YC_PHONE_DISPLAY = '074-7361723';
const YC_TURNSTILE_SECRET = process.env.YC_TURNSTILE_SECRET || ''; // empty = off
// Static ASP.NET fields of the MyPrice form (sent server-side only, never in the page).
const MYPRICE_STATIC = {
  __VIEWSTATE: '/wEPDwULLTEyMzg3MDYwNTRkZPLKuw2Etk3ZmqC6IDajQlUFNfV2XrCZEGbSFOm01TGv',
  __VIEWSTATEGENERATOR: 'F17C4103',
  __EVENTVALIDATION: '/wEdAAU6k7rSAmZ7k1iphhcPJ8anJL9Sv3RP6Va36YFE7xlFZaxJKqgkkwrpGycN/woiMmpZgELG/yaC318vAswmzf9MirvmLAyY3945UhpkK6XlMMHnqcLxggbCVJChewariwFF0fomrNp3tRgWAotBF+OL',
  hdn_psrc: '', fk_md_product_id: '0', fk_dynamic_content_by_profile_id: ''
};

// IP counter. Kept in the function instance's memory: it holds while the instance is warm.
// For a hard limit across instances, connect a Redis/KV store and replace these two functions.
const ipHits = globalThis.__ycIpHits || (globalThis.__ycIpHits = new Map());
function ipRecent(ip, now) {
  const list = (ipHits.get(ip) || []).filter((t) => now - t < YC_IP_WINDOW * 1000);
  ipHits.set(ip, list);
  return list.length;
}
function ipCount(ip, now) { ipHits.set(ip, [...(ipHits.get(ip) || []), now]); }

function log(reason, ip, data) {
  // Block log → Vercel runtime logs (Project → Logs, filter "yc_lead_guard").
  console.log(JSON.stringify({ yc_lead_guard: reason, at: new Date().toISOString(), ip, source: data.source || '', name: data.name || '', phone: data.phone || '' }));
}

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

function normalizePhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d;
}
function validPhone(d) {
  if (/(\d)\1{6}$/.test(d)) return false; // ends with 7 identical digits
  return /^05\d{8}$/.test(d) || /^0[23489]\d{7}$/.test(d) || /^07[2-9]\d{7}$/.test(d) || /^1(599|700|800)\d{6}$/.test(d);
}
function validName(v) {
  if (!v || v.length > 60 || /\d/.test(v)) return false;
  if (!/^[A-Za-zא-ת][A-Za-zא-ת \-'"׳״.]*$/.test(v)) return false;
  return (v.match(/[A-Za-zא-ת]/g) || []).length >= 2;
}
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;

function clientIp(req) {
  // On Vercel the platform sets these; a client cannot override x-vercel-forwarded-for.
  const h = req.headers;
  return String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim();
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : await new Promise((ok) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => ok(s)); });
  return Object.fromEntries(new URLSearchParams(raw));
}

const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'Method not allowed' });
  const body = await readBody(req);
  const ip = clientIp(req);
  const data = {
    name: clean(body[YC_FIELDS.name]),
    phone: normalizePhone(body[YC_FIELDS.phone]),
    email: clean(body[YC_FIELDS.email]),
    msg: String(body[YC_FIELDS.msg] || '').trim().slice(0, 3000),
    source: clean(body.yc_source).slice(0, 200)
  };

  // 1. Honeypot: fake thanks, nothing sent, not counted.
  if (clean(body.yc_website)) { log('honeypot', ip, data); return send(res, 200, { ok: true }); }

  // 2. Form fields.
  const errors = {};
  if (!validName(data.name)) errors.name = 'נא להזין שם באותיות עברית או אנגלית';
  if (!validPhone(data.phone)) errors.phone = 'נא להזין מספר טלפון ישראלי תקין';
  if (data.email && !validEmail(data.email)) errors.email = 'כתובת המייל לא נראית תקינה';
  for (const role of YC_REQUIRED) if (!errors[role] && !data[role]) errors[role] = 'זהו שדה חובה';
  if (Object.keys(errors).length) { log('invalid:' + Object.keys(errors).join(','), ip, data); return send(res, 422, { ok: false, errors }); }

  // 3. Turnstile (when configured).
  if (YC_TURNSTILE_SECRET) {
    const tv = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: YC_TURNSTILE_SECRET, response: String(body['cf-turnstile-response'] || ''), remoteip: ip }) }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!tv.success) { log('turnstile', ip, data); return send(res, 422, { ok: false, errors: { turnstile: 'נא לאשר שאתם לא רובוט' } }); }
  }

  // 4. IP limit (only successful leads are counted).
  const now = Date.now();
  if (ipRecent(ip, now) >= YC_IP_MAX) { log('ip_limit', ip, data); return send(res, 429, { ok: false, message: 'כבר התקבלו ממך פניות. אפשר להתקשר אלינו: ' + YC_PHONE_DISPLAY }); }

  // 5. Forward to MyPrice. IDs always come from the settings above, never from the request.
  const out = new URLSearchParams();
  out.set('__VIEWSTATE', MYPRICE_STATIC.__VIEWSTATE);
  out.set('__VIEWSTATEGENERATOR', MYPRICE_STATIC.__VIEWSTATEGENERATOR);
  out.set('__EVENTVALIDATION', MYPRICE_STATIC.__EVENTVALIDATION);
  out.set(YC_FIELDS.name, data.name);
  out.set(YC_FIELDS.phone, data.phone);
  out.set(YC_FIELDS.email, data.email);
  out.set(YC_FIELDS.msg, data.msg);
  out.set('hdn_psrc', MYPRICE_STATIC.hdn_psrc);
  out.set('fk_md_product_id', MYPRICE_STATIC.fk_md_product_id);
  out.set('fk_affiliate_id', YC_MYPRICE_AFFILIATE);
  out.set('fk_service_id', YC_MYPRICE_SERVICE);
  out.set('fk_dynamic_content_by_profile_id', MYPRICE_STATIC.fk_dynamic_content_by_profile_id);

  let answer = '', status = 0;
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
  // Open the MyPrice form page first, like a browser would: take its session cookie and fresh hidden fields.
  let cookie = '';
  try {
    const pg = await fetch(YC_MYPRICE_FORM_PAGE, { headers: { 'User-Agent': UA, 'Accept-Language': 'he-IL,he;q=0.9' }, signal: AbortSignal.timeout(10000) });
    const set = typeof pg.headers.getSetCookie === 'function' ? pg.headers.getSetCookie() : [pg.headers.get('set-cookie') || ''];
    cookie = set.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
    const html = await pg.text();
    for (const n of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
      const m = html.match(new RegExp('name="' + n + '"[^>]*value="([^"]*)"')) || html.match(new RegExp('id="' + n + '"[^>]*value="([^"]*)"'));
      if (m) out.set(n, m[1]);
    }
  } catch (e) { /* fall back to the static values */ }
  try {
    const r = await fetch(YC_MYPRICE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'he-IL,he;q=0.9', 'Origin': 'https://www.myprice.co.il', 'Referer': YC_MYPRICE_FORM_PAGE, ...(cookie ? { Cookie: cookie } : {}) }, body: out.toString(), signal: AbortSignal.timeout(20000) });
    status = r.status; answer = (await r.text()).trim();
  } catch (e) { answer = 'fetch_error: ' + e.name; }

  // MyPrice answers "1|<url>" or "2|..." on success, "0|<reason>" on rejection.
  if (status >= 200 && status < 400 && /^[12]\|/.test(answer)) {
    ipCount(ip, now);
    console.log(JSON.stringify({ yc_lead_guard: 'sent', at: new Date().toISOString(), ip, source: data.source }));
    return send(res, 200, { ok: true });
  }
  log('myprice_error:' + status + ':' + answer.slice(0, 60) + (cookie ? ':cookie' : ':nocookie'), ip, data);
  return send(res, 502, { ok: false, message: 'הפנייה לא נשלחה בגלל תקלה זמנית. נסו שוב או התקשרו: ' + YC_PHONE_DISPLAY });
}

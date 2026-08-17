// server.js - API REST de PDFmania (Postgres / Supabase)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool, q, one, many, init, seed, COUNTRIES, CATALOG } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pdfmania-dev-secret-cambia-esto';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'pdfmania-demo';

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Envuelve handlers async y captura errores
const h = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Error interno' }); });

function signToken(user, workspaceId) {
  return jwt.sign({ uid: user.id, email: user.email, ws: workspaceId }, JWT_SECRET, { expiresIn: '30d' });
}
const firstWorkspace = (userId) => one('SELECT * FROM workspaces WHERE user_id=$1 ORDER BY id LIMIT 1', [userId]);

// Asegura que la cuenta tenga las 6 marcas (subcuentas) de PDFmania por país.
async function ensureCountries(userId) {
  const ws = await many('SELECT id,name FROM workspaces WHERE user_id=$1 ORDER BY id', [userId]);
  const onlyPlaceholder = ws.length === 1 && /Marca 1$/.test(ws[0].name || '');
  if (ws.length !== 0 && !onlyPlaceholder) return; // ya tiene sus marcas
  for (const c of COUNTRIES) {
    const w = await one('INSERT INTO workspaces (user_id,name,country_code,currency,timezone,flag,beneficiary_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [userId, c.name, c.cc, c.cur, c.tz, c.flag, 'PDFmania ' + c.cc]);
    for (const [n, p] of (CATALOG[c.cc] || [])) await q('INSERT INTO products (workspace_id,name,price) VALUES ($1,$2,$3)', [w.id, n, p]);
  }
  if (onlyPlaceholder) {
    const sc = await one('SELECT COUNT(*)::int c FROM sales WHERE workspace_id=$1', [ws[0].id]);
    if (sc.c === 0) await q('DELETE FROM workspaces WHERE id=$1', [ws[0].id]);
  }
}

async function authMiddleware(req, res, next) {
  const hh = req.headers.authorization || '';
  const token = hh.startsWith('Bearer ') ? hh.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await one('SELECT id,email,name FROM users WHERE id=$1', [payload.uid]);
    if (!user) return res.status(401).json({ error: 'Usuario no existe' });
    let ws = await one('SELECT * FROM workspaces WHERE id=$1 AND user_id=$2', [payload.ws, user.id]);
    if (!ws) ws = await firstWorkspace(user.id);
    req.user = user; req.workspace = ws;
    next();
  } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
}
const auth = (fn) => [authMiddleware, h(fn)];

// ---------- Auth ----------
app.get('/api/auth/config', (req, res) => {
  res.json({ googleEnabled: !!GOOGLE_CLIENT_ID, googleClientId: GOOGLE_CLIENT_ID, devLogin: true });
});

app.post('/api/auth/signup', h(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Email y contraseña (mín. 6) requeridos' });
  const exists = await one('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'Ese correo ya está registrado' });
  const hash = bcrypt.hashSync(password, 10);
  const u = await one('INSERT INTO users (email,password_hash,name) VALUES ($1,$2,$3) RETURNING id', [email.toLowerCase(), hash, name || 'Nuevo usuario']);
  await ensureCountries(u.id); // crea las 6 marcas (subcuentas) por país
  const first = await firstWorkspace(u.id);
  const user = { id: u.id, email: email.toLowerCase(), name };
  res.json({ token: signToken(user, first ? first.id : null), user });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await one('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  if (!user || !user.password_hash || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  const ws = await firstWorkspace(user.id);
  res.json({ token: signToken(user, ws ? ws.id : null), user: { id: user.id, email: user.email, name: user.name } });
}));

app.post('/api/auth/dev-login', h(async (req, res) => {
  const user = await one('SELECT * FROM users WHERE email=$1', ['demo@pdfmania.co']);
  if (!user) return res.status(404).json({ error: 'No hay usuario demo' });
  const ws = await firstWorkspace(user.id);
  res.json({ token: signToken(user, ws ? ws.id : null), user: { id: user.id, email: user.email, name: user.name } });
}));

app.get('/api/auth/account', auth(async (req, res) => {
  await ensureCountries(req.user.id); // si la cuenta está vacía, crea las 6 marcas
  try { if (!(await getSetting('public_url'))) await setSetting('public_url', req.protocol + '://' + req.get('host')); } catch (e) {}
  const ws = await one('SELECT * FROM workspaces WHERE id=$1 AND user_id=$2', [req.workspace ? req.workspace.id : 0, req.user.id]) || await firstWorkspace(req.user.id);
  res.json({ user: req.user, workspace: ws });
}));

// ---------- Workspaces ----------
app.get('/api/workspaces', auth(async (req, res) => {
  const list = await many('SELECT * FROM workspaces WHERE user_id=$1 ORDER BY id', [req.user.id]);
  res.json({ workspaces: list, current: req.workspace.id });
}));

app.post('/api/workspaces', auth(async (req, res) => {
  const { name, country_code, currency, timezone, flag } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const w = await one('INSERT INTO workspaces (user_id,name,country_code,currency,timezone,flag) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.user.id, name, country_code || 'CO', currency || 'COP', timezone || 'America/Bogota', flag || '🏳️']);
  res.json({ id: w.id });
}));

app.post('/api/auth/switch-workspace', auth(async (req, res) => {
  const { workspaceId } = req.body || {};
  const ws = await one('SELECT * FROM workspaces WHERE id=$1 AND user_id=$2', [workspaceId, req.user.id]);
  if (!ws) return res.status(404).json({ error: 'Marca no encontrada' });
  res.json({ token: signToken(req.user, ws.id), workspace: ws });
}));

// ---------- Dashboard ----------
app.get('/api/dashboard/products', auth(async (req, res) => {
  const list = await many('SELECT * FROM products WHERE workspace_id=$1 ORDER BY price DESC', [req.workspace.id]);
  res.json({ products: list });
}));

app.get('/api/dashboard/sales', auth(async (req, res) => {
  const wsId = req.workspace.id;
  const range = req.query.range || '30';
  // Construir el filtro de fechas segun el rango elegido
  let cond = '', p = [wsId];
  let startDate = new Date(), endDate = new Date();
  if (range === 'today') { cond = " AND created_at::date = current_date"; startDate = new Date(); }
  else if (range === '7') { cond = " AND created_at >= now()-interval '7 days'"; startDate = new Date(Date.now() - 6 * 864e5); }
  else if (range === 'all') {
    cond = '';
    const mn = await one('SELECT MIN(created_at)::date d FROM sales WHERE workspace_id=$1', [wsId]);
    startDate = mn && mn.d ? new Date(mn.d) : new Date(Date.now() - 29 * 864e5);
  }
  else if (range === 'custom' && req.query.from && req.query.to) {
    cond = ' AND created_at::date BETWEEN $2 AND $3'; p.push(req.query.from, req.query.to);
    startDate = new Date(req.query.from); endDate = new Date(req.query.to);
  }
  else { cond = " AND created_at >= now()-interval '30 days'"; startDate = new Date(Date.now() - 29 * 864e5); }

  const periodo = await one(`SELECT COALESCE(SUM(amount),0)::float8 s, COUNT(*)::int c FROM sales WHERE workspace_id=$1${cond}`, p);
  const hoy = await one(`SELECT COALESCE(SUM(amount),0)::float8 s, COUNT(*)::int c FROM sales WHERE workspace_id=$1 AND created_at::date=current_date`, [wsId]);
  // Contactos reales = conversaciones (leads) que entraron en el rango elegido
  const contactos = (await one(`SELECT COUNT(*)::int c FROM conversations WHERE workspace_id=$1${cond}`, p)).c;
  const conversion = contactos > 0 ? (periodo.c / contactos * 100) : 0;

  // Pipeline: cuántos clientes hay en cada etapa (dentro del rango)
  const pipeRows = await many(`SELECT COALESCE(stage,'nuevo') stage, COUNT(*)::int c FROM conversations WHERE workspace_id=$1${cond} GROUP BY 1`, p);
  const pipeMap = Object.fromEntries(pipeRows.map(r => [r.stage, r.c]));
  const pipeline = {
    nuevo: pipeMap.nuevo || 0,
    conversando: pipeMap.conversando || 0,
    pago: pipeMap.pago || 0,
    cliente: pipeMap.cliente || 0,
  };

  // Rendimiento por producto (dentro del rango)
  const porProducto = await many(`SELECT product_name, COUNT(*)::int unidades, COALESCE(SUM(amount),0)::float8 ingresos
     FROM sales WHERE workspace_id=$1${cond} GROUP BY product_name ORDER BY ingresos DESC`, p);
  const topProduct = porProducto[0] ? { product_name: porProducto[0].product_name, ventas: porProducto[0].unidades, ingresos: porProducto[0].ingresos } : null;

  // Serie diaria dentro del rango
  const rows = await many(`SELECT to_char(created_at::date,'YYYY-MM-DD') d, COALESCE(SUM(amount),0)::float8 ingresos, COUNT(*)::int ventas
     FROM sales WHERE workspace_id=$1${cond} GROUP BY 1`, p);
  const map = Object.fromEntries(rows.map(r => [r.d, r]));
  let days = Math.round((endDate - startDate) / 864e5) + 1;
  if (days < 1) days = 1; if (days > 120) { startDate = new Date(endDate.getTime() - 119 * 864e5); days = 120; }
  const labels = [], serieIngresos = [], serieVentas = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(startDate.getTime() + i * 864e5);
    const key = dt.toISOString().slice(0, 10);
    labels.push(key.slice(5));
    serieIngresos.push(map[key] ? map[key].ingresos : 0);
    serieVentas.push(map[key] ? map[key].ventas : 0);
  }

  // Mejor producto por día (dentro del rango)
  const mejorDia = await many(`SELECT d, product_name, ingresos FROM (
      SELECT to_char(created_at::date,'YYYY-MM-DD') d, product_name, COALESCE(SUM(amount),0)::float8 ingresos,
             ROW_NUMBER() OVER (PARTITION BY to_char(created_at::date,'YYYY-MM-DD') ORDER BY SUM(amount) DESC) rn
      FROM sales WHERE workspace_id=$1${cond} GROUP BY 1, product_name
    ) t WHERE rn=1 ORDER BY d DESC LIMIT 14`, p);

  const topClientes = await many(`SELECT customer_name, COUNT(*)::int ventas, COALESCE(SUM(amount),0)::float8 total
     FROM sales WHERE workspace_id=$1${cond} GROUP BY customer_name ORDER BY total DESC LIMIT 5`, p);

  // Gasto de anuncios (Meta) de ESTE país en el rango seleccionado, en la moneda local
  const cc = req.workspace.country_code;
  let sc = '', sp = [cc];
  if (range === 'today') sc = ' AND date = current_date';
  else if (range === '7') sc = ' AND date >= current_date-6';
  else if (range === 'all') sc = '';
  else if (range === 'custom' && req.query.from && req.query.to) { sc = ' AND date BETWEEN $2 AND $3'; sp.push(req.query.from, req.query.to); }
  else sc = ' AND date >= current_date-29';
  const spendRow = await one(`SELECT COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code=$1${sc}`, sp);
  const fxRow = await one('SELECT fx FROM countries WHERE code=$1', [cc]);
  const fx = (fxRow && fxRow.fx) || 1;
  const gastoUsd = spendRow.s;
  const gastoLocal = gastoUsd * fx;
  const roas = gastoLocal > 0 ? periodo.s / gastoLocal : null;
  const neto = periodo.s - gastoLocal;

  res.json({
    currency: req.workspace.currency, range,
    ingresosHoy: hoy.s, ventasHoy: hoy.c,
    ingresosPeriodo: periodo.s, ventasPeriodo: periodo.c,
    contactos, conversion: Math.round(conversion * 10) / 10,
    pipeline,
    topProduct, porProducto, mejorDia,
    ticketPromedio: periodo.c > 0 ? periodo.s / periodo.c : 0,
    gastoLocal, gastoUsd, roas, neto,
    chart: { labels, ingresos: serieIngresos, ventas: serieVentas },
    topClientes,
    ventasPorProducto: porProducto.map(p => ({ product_name: p.product_name, ventas: p.unidades, total: p.ingresos })),
  });
}));

// Pipeline tipo CRM: columnas por etapa con clientes y valor total por etapa
app.get('/api/pipeline', auth(async (req, res) => {
  const wsId = req.workspace.id;
  // Valor de referencia por lead que aún no compra: precio del producto (el más caro si hay varios)
  const prodRow = await one('SELECT COALESCE(MAX(price),0)::float8 p FROM products WHERE workspace_id=$1', [wsId]);
  const refPrice = prodRow ? prodRow.p : 0;
  // Conversaciones con su venta real (si existe) y último monto de comprobante
  const rows = await many(`
    SELECT c.id, c.wa_id, c.name, COALESCE(c.stage,'nuevo') stage, c.last_at, c.last_message,
           s.amount AS sale_amount,
           r.amount AS receipt_amount
    FROM conversations c
    LEFT JOIN LATERAL (SELECT amount FROM sales WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) s ON true
    LEFT JOIN LATERAL (SELECT amount FROM receipts WHERE conversation_id=c.id AND amount IS NOT NULL ORDER BY created_at DESC LIMIT 1) r ON true
    WHERE c.workspace_id=$1
    ORDER BY c.last_at DESC NULLS LAST`, [wsId]);
  const STAGES = ['nuevo', 'conversando', 'pago', 'cliente'];
  const cols = {}; STAGES.forEach(s => cols[s] = { stage: s, count: 0, value: 0, clients: [] });
  for (const r of rows) {
    const st = STAGES.includes(r.stage) ? r.stage : 'nuevo';
    // Valor: venta real > monto de comprobante > precio de referencia del producto
    const val = r.sale_amount != null ? Number(r.sale_amount)
      : (r.receipt_amount != null ? Number(r.receipt_amount) : refPrice);
    cols[st].count++;
    cols[st].value += val;
    cols[st].clients.push({ id: r.id, wa_id: r.wa_id, name: r.name || r.wa_id, last_at: r.last_at, last_message: r.last_message, value: val, isSale: r.sale_amount != null });
  }
  const totalLeads = rows.length;
  const totalValue = STAGES.reduce((a, s) => a + cols[s].value, 0);
  res.json({
    currency: req.workspace.currency,
    stages: STAGES.map(s => cols[s]),
    totalLeads, totalValue, refPrice,
  });
}));

app.get('/api/dashboard/sales-list', auth(async (req, res) => {
  const list = await many('SELECT * FROM sales WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100', [req.workspace.id]);
  res.json({ sales: list });
}));

app.post('/api/dashboard/sale', auth(async (req, res) => {
  const { product_name, amount, customer_name, source } = req.body || {};
  if (!amount) return res.status(400).json({ error: 'Monto requerido' });
  const prod = await one('SELECT id FROM products WHERE workspace_id=$1 AND name=$2', [req.workspace.id, product_name || '']);
  const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.workspace.id, prod ? prod.id : null, product_name || 'Venta', Math.round(amount), customer_name || 'Cliente', source || 'manual']);
  res.json({ id: s.id });
}));

// ---------- Parte 4: Modelo financiero (Waterfall NETO Jonás) ----------
// Traduce el rango de fechas (?range=today|7|30|custom|all) a condiciones SQL seguras.
// tz = zona horaria de la cuenta de anuncios, para que "hoy" cuadre con Meta.
function safeDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null; }
function financeRangeConds(qy, tz) {
  const t = (tz && /^[A-Za-z_\/+-]+$/.test(tz)) ? tz : 'UTC';
  const today = `(now() AT TIME ZONE '${t}')::date`;
  const sd = `(created_at AT TIME ZONE '${t}')::date`;
  const range = (qy && qy.range) || 'all';
  if (range === 'today') return { salesCond: `AND ${sd} = ${today}`, spendCond: `AND date = ${today}` };
  if (range === '7') return { salesCond: `AND ${sd} >= ${today}-6`, spendCond: `AND date >= ${today}-6` };
  if (range === '30') return { salesCond: `AND ${sd} >= ${today}-29`, spendCond: `AND date >= ${today}-29` };
  if (range === 'custom') { const f = safeDate(qy.from), tt = safeDate(qy.to); if (f && tt) return { salesCond: `AND ${sd} BETWEEN '${f}' AND '${tt}'`, spendCond: `AND date BETWEEN '${f}' AND '${tt}'` }; }
  return { salesCond: '', spendCond: '' };
}
async function computeFinanceForUser(userId, conds) {
  const salesCond = (conds && conds.salesCond) || '';
  const spendCond = (conds && conds.spendCond) || '';
  const workspaces = await many('SELECT * FROM workspaces WHERE user_id=$1 ORDER BY id', [userId]);
  const rows = [];
  for (const w of workspaces) {
    const c = (await one('SELECT * FROM countries WHERE code=$1', [w.country_code])) || { cobrador: 0, procesador: 0, andres: 15, proc_name: '—', fx: 1 };
    const fx = c.fx || 1;
    const revRow = await one(`SELECT COALESCE(SUM(amount),0)::float8 s FROM sales WHERE workspace_id=$1 ${salesCond}`, [w.id]);
    const revenue = revRow.s / fx;
    const spendRow = await one(`SELECT COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code=$1 ${spendCond}`, [w.country_code]);
    const spend = spendRow.s;
    const cobrador = revenue * c.cobrador / 100;
    const procesador = revenue * c.procesador / 100;
    const gb = revenue - spend - cobrador - procesador;
    const andres = Math.max(0, gb) * c.andres / 100;
    const neto = revenue - spend - cobrador - procesador - andres;
    const roas = spend > 0 ? revenue / spend : null;
    let estado = 'Sin data';
    if (!(revenue === 0 && spend === 0)) {
      if (roas != null && roas > 2 && neto > 0) estado = 'Escalar';
      else if (roas != null && roas >= 1.5 && roas <= 2) estado = 'Mantener';
      else estado = 'Pausar';
    }
    rows.push({
      workspace_id: w.id, name: w.name, flag: w.flag, country_code: w.country_code,
      commissions: { cobrador: c.cobrador, procesador: c.procesador, andres: c.andres, proc_name: c.proc_name },
      revenue, spend, cobrador, procesador, gb, andres, neto, roas, estado,
    });
  }
  const T = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, spend: a.spend + r.spend, cobrador: a.cobrador + r.cobrador,
    procesador: a.procesador + r.procesador, andres: a.andres + r.andres, neto: a.neto + r.neto,
  }), { revenue: 0, spend: 0, cobrador: 0, procesador: 0, andres: 0, neto: 0 });
  T.roas = T.spend > 0 ? T.revenue / T.spend : null;
  T.pctNeto = T.revenue > 0 ? Math.round(T.neto / T.revenue * 1000) / 10 : 0;
  T.gb = T.revenue - T.spend - T.cobrador - T.procesador;
  return { totals: T, rows };
}

app.get('/api/finance/waterfall', auth(async (req, res) => {
  res.json(await computeFinanceForUser(req.user.id));
}));

// Vista Global (founder): consolida TODOS los países + desglose por país
app.get('/api/dashboard/global', auth(async (req, res) => {
  const tz = (await getSetting('meta_tz')) || 'UTC';
  const conds = financeRangeConds(req.query, tz);
  const fin = await computeFinanceForUser(req.user.id, conds);
  const byWs = {};
  fin.rows.forEach(r => { byWs[r.workspace_id] = r; });
  const wss = await many('SELECT id,name,flag,country_code,currency FROM workspaces WHERE user_id=$1 ORDER BY id', [req.user.id]);
  const perCountry = [];
  let totalSales = 0;
  for (const w of wss) {
    const sc = await one(`SELECT COUNT(*)::int c FROM sales WHERE workspace_id=$1 ${conds.salesCond}`, [w.id]);
    const fr = byWs[w.id] || { revenue: 0, spend: 0, neto: 0, roas: null, estado: 'Sin data' };
    totalSales += sc.c;
    perCountry.push({ workspace_id: w.id, name: w.name, flag: w.flag, currency: w.currency, sales: sc.c, revenue: fr.revenue, spend: fr.spend, neto: fr.neto, roas: fr.roas, estado: fr.estado });
  }
  // Gasto de países que NO tienen marca todavía (Brasil, Venezuela, etc.) o sin país reconocido:
  // se INCLUYE en el total (para cuadrar con Meta) y se muestra como fila aparte.
  const wsCodes = new Set(wss.map(w => w.country_code));
  const spendRows = await many(`SELECT country_code, COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE 1=1 ${conds.spendCond} GROUP BY country_code`);
  const T = { ...fin.totals };
  let extraSpend = 0, unmatchedSpend = 0;
  for (const sr of spendRows) {
    if (wsCodes.has(sr.country_code)) continue; // ya está contado en las marcas
    const spend = Math.round((sr.s || 0) * 100) / 100;
    if (spend <= 0) continue;
    extraSpend += spend;
    const isXX = sr.country_code === 'XX';
    if (isXX) unmatchedSpend += spend;
    perCountry.push({
      workspace_id: null,
      name: isXX ? 'Sin país (revisar nombre)' : (COUNTRY_NAMES[sr.country_code] || sr.country_code),
      flag: isXX ? '🌐' : (COUNTRY_FLAGS[sr.country_code] || '🏳️'),
      currency: 'USD', sales: 0, revenue: 0, spend, neto: -spend, roas: null, estado: 'Sin data',
      no_brand: true,
    });
  }
  if (extraSpend > 0) {
    T.spend = (T.spend || 0) + extraSpend;
    T.neto = (T.neto || 0) - extraSpend;
    T.gb = (T.gb || 0) - extraSpend;
    T.roas = T.spend > 0 ? T.revenue / T.spend : null;
    T.pctNeto = T.revenue > 0 ? Math.round(T.neto / T.revenue * 1000) / 10 : 0;
  }
  res.json({ totals: T, totalSales, perCountry, unmatchedSpend });
}));

app.get('/api/ads/spend', auth(async (req, res) => {
  const fin = await computeFinanceForUser(req.user.id);
  const byCountry = fin.rows.filter(r => r.spend > 0 || r.revenue > 0);
  const campaigns = [];
  for (const r of byCountry) {
    const camps = await many('SELECT campaign, product, spend_usd FROM ad_spend WHERE country_code=$1', [r.country_code]);
    camps.forEach(c => campaigns.push({ name: c.campaign, product: c.product || '—', pais: r.flag + ' ' + r.country_code, spend: c.spend_usd, roas: r.roas, estado: r.estado }));
  }
  // Campañas cuyo nombre no tenía país reconocido: se guardan como 'XX' para no perder el gasto
  const noCountry = await many("SELECT campaign, product, spend_usd FROM ad_spend WHERE country_code='XX'");
  noCountry.forEach(c => campaigns.push({ name: c.campaign, product: c.product || '—', pais: '🌐 Sin país', spend: c.spend_usd, roas: null, estado: 'Sin data' }));
  const byProduct = await productAdsBreakdown(req.user.id);
  const connected = ((await one("SELECT value FROM settings WHERE key='meta_connected'")) || {}).value === '1';
  const acct = ((await one("SELECT value FROM settings WHERE key='meta_account'")) || {}).value || '';
  const lastSync = (await getSetting('meta_last_sync')) || null;
  const realTotal = (await one('SELECT COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend')).s;
  const unmatchedTotal = noCountry.reduce((a, c) => a + (c.spend_usd || 0), 0);
  res.json({ connected, account: acct, lastSync, campaigns, byCountry, byProduct, realTotal, unmatchedTotal, autoSync: true });
}));

app.post('/api/ads/connect', auth(async (req, res) => {
  const { account, token } = req.body || {};
  await setSetting('meta_connected', '1');
  await setSetting('meta_account', account || '');
  await setSetting('meta_user', String(req.user.id));
  if (token) await setSetting('meta_token', token);
  res.json({ connected: true });
}));
app.post('/api/ads/disconnect', auth(async (req, res) => {
  await setSetting('meta_connected', '0');
  res.json({ connected: false });
}));

// --- Sincronización real con Meta Marketing API ---
// Convierte la moneda de la cuenta de anuncios a USD usando la tabla fx (unidades locales por USD)
async function currencyToUsdFactor(currencyCode) {
  if (!currencyCode || currencyCode === 'USD') return 1;
  const entry = COUNTRIES.find(c => c.cur === currencyCode);
  if (!entry) return 1;
  const row = await one('SELECT fx FROM countries WHERE code=$1', [entry.cc]);
  return (row && row.fx) ? row.fx : 1;
}
// Mapas de países LATAM (código -> nombre / bandera) para mostrar y detectar
const COUNTRY_NAMES = { CO: 'Colombia', AR: 'Argentina', MX: 'México', CR: 'Costa Rica', GT: 'Guatemala', DO: 'RD', VE: 'Venezuela', BR: 'Brasil', PE: 'Perú', EC: 'Ecuador', CL: 'Chile', BO: 'Bolivia', PY: 'Paraguay', UY: 'Uruguay', PA: 'Panamá', HN: 'Honduras', SV: 'El Salvador', NI: 'Nicaragua', US: 'USA', ES: 'España' };
const COUNTRY_FLAGS = { CO: '🇨🇴', AR: '🇦🇷', MX: '🇲🇽', CR: '🇨🇷', GT: '🇬🇹', DO: '🇩🇴', VE: '🇻🇪', BR: '🇧🇷', PE: '🇵🇪', EC: '🇪🇨', CL: '🇨🇱', BO: '🇧🇴', PY: '🇵🇾', UY: '🇺🇾', PA: '🇵🇦', HN: '🇭🇳', SV: '🇸🇻', NI: '🇳🇮', US: '🇺🇸', ES: '🇪🇸' };
// Convierte una bandera emoji (dos indicadores regionales) a su código ISO (🇲🇽 -> "MX")
function flagToCode(str) {
  const RA = 0x1F1E6; // 🇦
  const cps = [...(str || '')].map(c => c.codePointAt(0));
  for (let i = 0; i < cps.length - 1; i++) {
    if (cps[i] >= RA && cps[i] <= RA + 25 && cps[i + 1] >= RA && cps[i + 1] <= RA + 25) {
      return String.fromCharCode(65 + cps[i] - RA) + String.fromCharCode(65 + cps[i + 1] - RA);
    }
  }
  return null;
}
// Detecta el país de una campaña por: 1) bandera emoji, 2) nombre, 3) abreviación
function parseCountryFromName(name) {
  const raw = name || '';
  const flag = flagToCode(raw);
  if (flag && COUNTRY_NAMES[flag]) return flag;
  const s = normText(raw); // minúsculas, sin acentos
  const map = [
    ['MX', /(mexico|\bmx\b|\bmex\b|\bmxn\b)/],
    ['CO', /(colombia|bogota|\bcol\b|\bco\b)/],
    ['AR', /(argentina|buenos aires|\barg\b|\bar\b)/],
    ['CR', /(costa rica|\bcr\b|\bcri\b)/],
    ['GT', /(guatemala|\bgt\b|\bgua\b|\bgtm\b)/],
    ['DO', /(republica dominicana|dominicana|santo domingo|\brd\b|\bdo\b|\bdom\b)/],
    ['VE', /(venezuela|\bve\b|\bven\b)/],
    ['BR', /(brasil|brazil|\bbr\b|\bbra\b)/],
    ['PE', /(\bperu\b|\bpe\b|\bper\b)/],
    ['EC', /(ecuador|\bec\b|\becu\b)/],
    ['CL', /(chile|\bcl\b|\bchl\b)/],
    ['BO', /(bolivia|\bbo\b|\bbol\b)/],
    ['PY', /(paraguay|\bpy\b|\bpry\b)/],
    ['UY', /(uruguay|\buy\b|\bury\b)/],
    ['PA', /(panama|\bpa\b|\bpan\b)/],
    ['HN', /(honduras|\bhn\b|\bhnd\b)/],
    ['SV', /(salvador|\bsv\b|\bslv\b)/],
    ['NI', /(nicaragua|\bni\b|\bnic\b)/],
  ];
  for (const [cc, re] of map) if (re.test(s)) return cc;
  return null;
}
// Empareja el producto por su nombre dentro del nombre de la campaña
function matchProduct(name, products) {
  const s = (name || '').toLowerCase();
  let best = null;
  for (const p of products) {
    const pl = (p || '').toLowerCase();
    if (pl && s.includes(pl) && (!best || pl.length > best.toLowerCase().length)) best = p;
  }
  return best;
}
async function allProductNames(userId) {
  const rows = await many('SELECT DISTINCT p.name FROM products p JOIN workspaces w ON w.id=p.workspace_id WHERE w.user_id=$1', [userId]);
  return rows.map(r => r.name).filter(Boolean);
}

app.get('/api/ads/sync-status', auth(async (req, res) => {
  res.json({
    connected: (await getSetting('meta_connected')) === '1',
    account: (await getSetting('meta_account')) || '',
    has_token: !!(await getSetting('meta_token')),
    last_sync: (await getSetting('meta_last_sync')) || null,
  });
}));

// Función reutilizable: la usa el botón manual, el auto-sync y el temporizador de fondo.
let _syncLock = false;
async function runMetaSync(userId, preset) {
  if (_syncLock) return { error: 'busy' };
  _syncLock = true;
  try {
    return await runMetaSyncInner(userId, preset);
  } finally {
    _syncLock = false;
  }
}
async function runMetaSyncInner(userId, preset) {
  const act = ((await getSetting('meta_account')) || '').trim();
  const token = ((await getSetting('meta_token')) || '').trim();
  if (!act || !token) return { error: 'no_creds' };
  const acctId = act.startsWith('act_') ? act : ('act_' + act.replace(/[^0-9]/g, ''));
  preset = preset || 'last_30d';
  // 1) Moneda + zona horaria de la cuenta
  let currency = 'USD', acctName = '', tz = 'UTC';
  try {
    const info = await fetch(`https://graph.facebook.com/v21.0/${acctId}?fields=currency,name,timezone_name&access_token=${encodeURIComponent(token)}`).then(r => r.json());
    if (info.error) return { error: 'Meta: ' + info.error.message };
    currency = info.currency || 'USD'; acctName = info.name || ''; tz = info.timezone_name || 'UTC';
    await setSetting('meta_tz', tz);
  } catch (e) { return { error: 'No pude conectar con Meta. Revisa el token.' }; }
  const factor = await currencyToUsdFactor(currency);
  // 2) Rango de fechas en la zona horaria de la cuenta, INCLUYENDO hoy
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const sinceD = new Date(todayStr + 'T00:00:00Z'); sinceD.setUTCDate(sinceD.getUTCDate() - 29);
  const sinceStr = sinceD.toISOString().slice(0, 10);
  const tr = encodeURIComponent(JSON.stringify({ since: sinceStr, until: todayStr }));
  // 3) Insights por campaña, día por día (con paginación)
  let url = `https://graph.facebook.com/v21.0/${acctId}/insights?level=campaign&fields=campaign_name,spend,date_start&time_range=${tr}&time_increment=1&limit=500&access_token=${encodeURIComponent(token)}`;
  const rows = []; let guard = 0;
  while (url && guard < 25) {
    let d;
    try { d = await fetch(url).then(r => r.json()); } catch (e) { return { error: 'Error consultando Meta' }; }
    if (d.error) return { error: 'Meta: ' + d.error.message };
    (d.data || []).forEach(x => rows.push(x));
    url = (d.paging && d.paging.next) || null; guard++;
  }
  // 3) Repartir por país y producto. Meta es la fuente de verdad: borramos todo y reescribimos.
  const products = await allProductNames(userId);
  await q('DELETE FROM ad_spend');
  let synced = 0, totalUsd = 0, unmatchedUsd = 0; const unmatched = [];
  for (const r of rows) {
    const spendUsd = (parseFloat(r.spend || '0') || 0) / factor;
    const cc = parseCountryFromName(r.campaign_name);
    if (!cc) {
      // No perder el gasto: se guarda como 'XX' (Sin país) para que el total sí cuadre con Meta.
      if (spendUsd > 0) {
        unmatched.push({ name: r.campaign_name, spend: Math.round(spendUsd * 100) / 100 });
        unmatchedUsd += spendUsd;
        await q("INSERT INTO ad_spend (country_code,campaign,product,spend_usd,source,date) VALUES ('XX',$1,NULL,$2,'meta',COALESCE($3,current_date))", [r.campaign_name, spendUsd, r.date_start || null]);
      }
      continue;
    }
    const prod = matchProduct(r.campaign_name, products);
    await q("INSERT INTO ad_spend (country_code,campaign,product,spend_usd,source,date) VALUES ($1,$2,$3,$4,'meta',COALESCE($5,current_date))", [cc, r.campaign_name, prod, spendUsd, r.date_start || null]);
    synced++; totalUsd += spendUsd;
  }
  await setSetting('meta_last_sync', new Date().toISOString());
  return {
    synced, unmatched, currency, account_name: acctName,
    matched_usd: Math.round(totalUsd * 100) / 100,
    unmatched_usd: Math.round(unmatchedUsd * 100) / 100,
    total_usd: Math.round((totalUsd + unmatchedUsd) * 100) / 100,
    campaigns_found: rows.length,
  };
}

app.post('/api/ads/sync', auth(async (req, res) => {
  await setSetting('meta_user', String(req.user.id));
  const out = await runMetaSync(req.user.id, (req.body && req.body.range) || 'last_30d');
  if (out.error === 'no_creds') return res.status(400).json({ error: 'Falta el ID de cuenta (act_...) o el token. Conéctalos primero.' });
  if (out.error === 'busy') return res.status(409).json({ error: 'Ya hay una sincronización en curso. Espera unos segundos y vuelve a intentar.' });
  if (out.error) return res.status(400).json({ error: out.error });
  res.json(out);
}));

// Sincronización automática en segundo plano (cada 20 min mientras el servidor esté vivo)
let _autoSyncRunning = false;
async function autoMetaSync() {
  if (_autoSyncRunning) return;
  _autoSyncRunning = true;
  try {
    if ((await getSetting('meta_connected')) !== '1') return;
    if (!(await getSetting('meta_token'))) return;
    let uid = parseInt((await getSetting('meta_user')) || '0', 10);
    if (!uid) { const u = await one('SELECT id FROM users ORDER BY id LIMIT 1'); uid = u ? u.id : 0; }
    if (!uid) return;
    const out = await runMetaSync(uid, 'last_30d');
    if (out && !out.error) console.log('[auto-sync] Meta Ads OK · total $' + out.total_usd);
    else if (out && out.error && out.error !== 'no_creds') console.error('[auto-sync]', out.error);
  } catch (e) { console.error('[auto-sync]', e.message); }
  finally { _autoSyncRunning = false; }
}
setInterval(autoMetaSync, 20 * 60 * 1000);
setTimeout(autoMetaSync, 15 * 1000); // una corrida al arrancar

// Borra todos los gastos (para limpiar los datos de ejemplo)
app.post('/api/ads/clear', auth(async (req, res) => {
  await q('DELETE FROM ad_spend');
  res.json({ ok: true });
}));

// ---------- WhatsApp Cloud API: conexión ----------
async function getSetting(k) { const r = await one('SELECT value FROM settings WHERE key=$1', [k]); return r ? r.value : null; }
async function setSetting(k, v) { await q('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, v]); }

app.get('/api/cloud/config', auth(async (req, res) => {
  res.json({
    connected: (await getSetting('wa_connected')) === '1',
    phone_number_id: (await getSetting('wa_phone_number_id')) || '',
    verify_token: (await getSetting('wa_verify_token')) || '',
    waba_id: (await getSetting('wa_waba_id')) || '',
    workspace_id: (await getSetting('wa_workspace_id')) || String(req.workspace.id),
  });
}));

// Activa el número: suscribe la app a la WABA y registra el número en Cloud API.
app.post('/api/cloud/register', auth(async (req, res) => {
  const { waba_id, pin } = req.body || {};
  const phoneId = await getSetting('wa_phone_number_id');
  const token = await getSetting('wa_token');
  if (!phoneId || !token) return res.status(400).json({ error: 'Primero guarda la conexión (Phone Number ID y token) arriba.' });
  if (!/^\d{6}$/.test(String(pin || ''))) return res.status(400).json({ error: 'El PIN debe ser exactamente 6 dígitos.' });
  const steps = [];
  // 1) Suscribir la app a la WABA (para RECIBIR mensajes)
  if (waba_id) {
    await setSetting('wa_waba_id', String(waba_id).trim());
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${String(waba_id).trim()}/subscribed_apps`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token },
      });
      const d = await r.json();
      if (d.error) steps.push('⚠️ Suscribir app a la WABA: ' + d.error.message);
      else steps.push('✅ App suscrita a la cuenta de WhatsApp (recibirá mensajes).');
    } catch (e) { steps.push('⚠️ No pude suscribir la app a la WABA.'); }
  }
  // 2) Registrar el número en Cloud API (para ENVIAR)
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/register`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: String(pin) }),
    });
    const d = await r.json();
    if (d.error) {
      const msg = d.error.message || 'Error al registrar';
      const already = /already/i.test(msg) || d.error.code === 100 && /registered/i.test(msg);
      if (already) { steps.push('✅ El número ya estaba registrado.'); return res.json({ ok: true, steps }); }
      const pinIssue = /pin|two.?step|verification|139/i.test(msg + (d.error.error_subcode || ''));
      const hint = pinIssue ? ' — El PIN no coincide con el que tiene el número. Restablécelo en WhatsApp Manager (llega un código por SMS al número) y reintenta con el PIN nuevo.' : '';
      return res.status(400).json({ error: 'Registro: ' + msg + hint, steps });
    }
    steps.push('✅ Número registrado en la API (podrá enviar).');
    return res.json({ ok: true, steps });
  } catch (e) { return res.status(400).json({ error: 'No pude conectar con Meta para registrar el número.', steps }); }
}));

app.post('/api/cloud/config', auth(async (req, res) => {
  const { phone_number_id, access_token, verify_token } = req.body || {};
  if (!phone_number_id || !access_token || !verify_token) return res.status(400).json({ error: 'Faltan datos (Phone Number ID, token y verify token)' });
  await setSetting('wa_phone_number_id', phone_number_id);
  await setSetting('wa_token', access_token);
  await setSetting('wa_verify_token', verify_token);
  await setSetting('wa_workspace_id', String(req.workspace.id));
  await setSetting('wa_connected', '1');
  res.json({ connected: true });
}));
app.post('/api/cloud/disconnect', auth(async (req, res) => {
  await setSetting('wa_connected', '0');
  res.json({ connected: false });
}));

// Diagnóstico de ENTREGA: envía un mensaje de prueba y devuelve la respuesta REAL de Meta
app.get('/api/cloud/last-error', auth(async (req, res) => {
  res.json({ error: (await getSetting('wa_last_error')) || '' });
}));
app.post('/api/cloud/test-send', auth(async (req, res) => {
  let { to, text } = req.body || {};
  to = String(to || '').replace(/[^0-9]/g, '');
  if (!to) return res.status(400).json({ error: 'Pon el número (con código de país, sin +). Ej: 521...' });
  const out = await sendWaResult(to, { type: 'text', text: { body: text || '✅ Prueba de envío desde PDFmania. Si ves esto, el envío funciona.' } });
  if (!out.ok) return res.status(400).json({ error: out.error });
  res.json({ ok: true, id: out.id });
}));

// Verificación del webhook (Meta hace un GET al conectar)
app.get('/api/webhooks/whatsapp', h(async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = await getSetting('wa_verify_token');
  if (mode === 'subscribe' && token && token === expected) return res.status(200).send(challenge);
  return res.sendStatus(403);
}));

// Recepción de mensajes entrantes de WhatsApp
app.post('/api/webhooks/whatsapp', h(async (req, res) => {
  res.sendStatus(200); // responder rápido a Meta
  try {
    const wsId = parseInt(await getSetting('wa_workspace_id') || '0', 10);
    const entries = (req.body && req.body.entry) || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        const value = change.value || {};
        const contacts = value.contacts || [];
        const nameByWa = {};
        contacts.forEach(c => { nameByWa[c.wa_id] = c.profile && c.profile.name; });
        for (const m of (value.messages || [])) {
          const from = m.from;
          const body = m.text ? m.text.body : ('[' + (m.type || 'mensaje') + ']');
          const name = nameByWa[from] || from;
          const conv = await one(
            `INSERT INTO conversations (workspace_id,wa_id,name,last_message,last_at,unread,bot_active)
             VALUES ($1,$2,$3,$4,now(),1,true)
             ON CONFLICT (workspace_id,wa_id) DO UPDATE SET last_message=$4, last_at=now(), unread=conversations.unread+1, name=COALESCE(conversations.name,$3)
             RETURNING id, bot_active`, [wsId, from, name, body]);
          const ws = await one('SELECT * FROM workspaces WHERE id=$1', [wsId]);
          // ¿Trae imagen o PDF? -> es comprobante; guardamos el archivo para poder VERLO en el chat.
          const isPdfDoc = m.type === 'document' && m.document && m.document.id && /pdf/i.test((m.document.mime_type || m.document.filename || ''));
          const mediaId = (m.type === 'image' && m.image && m.image.id) ? m.image.id : (isPdfDoc ? m.document.id : null);
          let mediaUrl = null, preMedia = null;
          if (mediaId) {
            try {
              preMedia = await downloadWaMedia(mediaId);
              if (preMedia && preMedia.base64) {
                const base = (await getSetting('public_url')) || (req.protocol + '://' + req.get('host'));
                const size = Math.round(preMedia.base64.length * 3 / 4);
                const mrow = await one('INSERT INTO media (workspace_id,name,mime,category,data,size) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
                  [wsId, 'comprobante-' + from, preMedia.mediaType, 'comprobante', preMedia.base64, size]);
                mediaUrl = base + '/api/media/file/' + mrow.id;
              }
            } catch (e) { console.error('save media error', e.message); }
          }
          await q('INSERT INTO messages (conversation_id,direction,body,type,wa_message_id,media_url) VALUES ($1,$2,$3,$4,$5,$6)',
            [conv.id, 'in', body, m.type || 'text', m.id || null, mediaUrl]);
          // Comprobante (imagen/PDF) -> verificar; texto -> flujos o agente IA
          if (mediaId) {
            await q("UPDATE conversations SET stage='pago' WHERE id=$1 AND stage <> 'cliente'", [conv.id]);
            processIncomingReceipt(wsId, conv.id, from, mediaId, preMedia).catch(e => console.error('receipt error', e));
          } else if (conv.bot_active && ws && (m.type === 'text' || m.text)) {
            handleBotResponse(ws, { id: conv.id, bot_active: conv.bot_active }, from, body).catch(e => console.error('bot error', e));
          }
        }
      }
    }
  } catch (e) { console.error('webhook wa error', e); }
}));

// ---------- Chat en Vivo ----------
app.get('/api/chat/conversations', auth(async (req, res) => {
  const list = await many('SELECT * FROM conversations WHERE workspace_id=$1 ORDER BY last_at DESC LIMIT 200', [req.workspace.id]);
  res.json({ conversations: list });
}));

app.get('/api/chat/conversation/:id', auth(async (req, res) => {
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  const msgs = await many('SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 500', [conv.id]);
  await q('UPDATE conversations SET unread=0 WHERE id=$1', [conv.id]);
  res.json({ conversation: conv, messages: msgs });
}));

app.post('/api/chat/send', auth(async (req, res) => {
  const { conversation_id, text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Texto requerido' });
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [conversation_id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

  const phoneId = await getSetting('wa_phone_number_id');
  const token = await getSetting('wa_token');
  let waMsgId = null, simulated = false;
  if (phoneId && token && (await getSetting('wa_connected')) === '1') {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.wa_id, type: 'text', text: { body: text } }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: (data.error && data.error.message) || 'Error enviando a WhatsApp' });
      waMsgId = data.messages && data.messages[0] && data.messages[0].id;
    } catch (e) { return res.status(502).json({ error: 'No se pudo contactar a WhatsApp' }); }
  } else {
    simulated = true; // sin conexión real: se guarda localmente (modo demo)
  }
  await q('INSERT INTO messages (conversation_id,direction,body,type,wa_message_id) VALUES ($1,$2,$3,$4,$5)', [conv.id, 'out', text, 'text', waMsgId]);
  await q('UPDATE conversations SET last_message=$1, last_at=now() WHERE id=$2', [text, conv.id]);
  res.json({ ok: true, simulated });
}));

app.post('/api/chat/takeover', auth(async (req, res) => {
  const { conversation_id, bot_active } = req.body || {};
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [conversation_id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
  await q('UPDATE conversations SET bot_active=$1 WHERE id=$2', [!!bot_active, conv.id]);
  res.json({ ok: true, bot_active: !!bot_active });
}));

// Cambiar manualmente la etapa del cliente
app.post('/api/chat/conversation/:id/stage', auth(async (req, res) => {
  const { stage } = req.body || {};
  const ok = ['nuevo', 'conversando', 'pago', 'cliente'];
  if (!ok.includes(stage)) return res.status(400).json({ error: 'Etapa inválida' });
  const conv = await one('SELECT * FROM conversations WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!conv) return res.status(404).json({ error: 'No encontrado' });
  await q('UPDATE conversations SET stage=$1 WHERE id=$2', [stage, conv.id]);
  // Si lo marcan como "Cliente" a mano, registra la venta (si no existe ya)
  let sale = null;
  if (stage === 'cliente') { const sid = await ensureSaleForConversation(req.workspace, conv, 'manual'); sale = { id: sid }; }
  res.json({ ok: true, stage, sale });
}));

// ---------- Inteligencia IA (Claude) ----------
app.get('/api/iaconfig/ia-config', auth(async (req, res) => {
  res.json({
    connected: !!(await getSetting('anthropic_key')),
    model: (await getSetting('anthropic_model')) || 'claude-sonnet-5',
    agent_name: (await getSetting('agent_name')) || 'Sofía',
    agent_tone: (await getSetting('agent_tone')) || 'cercano, amable y persuasivo, estilo WhatsApp',
    agent_instructions: (await getSetting('agent_instructions')) || '',
  });
}));
app.post('/api/iaconfig/ia-config', auth(async (req, res) => {
  const { api_key, model, agent_name, agent_tone, agent_instructions } = req.body || {};
  if (api_key) await setSetting('anthropic_key', api_key);
  if (model) await setSetting('anthropic_model', model);
  if (agent_name !== undefined) await setSetting('agent_name', agent_name);
  if (agent_tone !== undefined) await setSetting('agent_tone', agent_tone);
  if (agent_instructions !== undefined) await setSetting('agent_instructions', agent_instructions);
  res.json({ connected: !!(await getSetting('anthropic_key')) });
}));

// Arma el "cerebro" del vendedor IA con el catálogo y datos de pago de la marca actual
async function buildSalesSystem(ws) {
  const prods = await many('SELECT name,price,delivery_url FROM products WHERE workspace_id=$1', [ws.id]);
  const cur = ws.currency || '';
  const catalog = prods.length
    ? prods.map(p => `- ${p.name}: ${Number(p.price).toLocaleString('es-CO')} ${cur}`).join('\n')
    : '(aún no hay productos cargados; si preguntan, di que en un momento les compartes el catálogo)';
  const name = (await getSetting('agent_name')) || 'Sofía';
  const tone = (await getSetting('agent_tone')) || 'cercano, amable y persuasivo, estilo WhatsApp';
  const extra = (await getSetting('agent_instructions')) || '';
  const methods = await many('SELECT label,type,detail FROM payment_methods WHERE workspace_id=$1', [ws.id]);
  let pago;
  if (methods.length) {
    const lines = methods.map(m => {
      const t = m.type === 'link' ? '(link de pago)' : m.type === 'nequi' ? '(Nequi)' : '(transferencia)';
      return `- ${m.label || m.type} ${t}: ${m.detail}`;
    }).join('\n');
    pago = `Cuando el cliente quiera comprar, ofrécele estos métodos de pago y que elija el que prefiera:\n${lines}\nSi es link, dile que pague ahí; si es transferencia, dale la cuenta. Luego pídele que te envíe la FOTO del comprobante o captura del pago para confirmar y entregarle su producto al instante.`;
  } else if (ws.beneficiary_name) {
    pago = `Cuando el cliente quiera comprar, dale los datos de pago: transferir a "${ws.beneficiary_name}"${ws.beneficiary_account ? ' — ' + ws.beneficiary_account : ''}. Luego pídele que te envíe la FOTO del comprobante para confirmar y entregarle su producto al instante.`;
  } else {
    pago = `Si preguntan cómo pagar, di que enseguida les pasas los datos (aún no están configurados en el sistema).`;
  }
  return `Eres ${name}, la vendedora estrella de PDFmania ${ws.name || ''} 🛍️. Vendes productos digitales (guías, plantillas y cursos en PDF) por WhatsApp a clientes de LATAM.

TU PERSONALIDAD: ${tone}. Escribes como una persona real por WhatsApp: mensajes cortos (1 a 3 frases), naturales, con algún emoji con moderación. Nunca suenas como robot ni como un formulario.

TU MISIÓN: vender. Eres persuasiva pero honesta. Generas confianza, resuelves dudas, rompes objeciones (precio, "lo pienso", desconfianza) y llevas al cliente al cierre sin ser pesada. Creas urgencia sutil (bonos, cupos, precio de hoy) solo cuando ayuda.

CATÁLOGO Y PRECIOS (moneda ${cur}) — usa SOLO estos, no inventes productos ni precios:
${catalog}

CÓMO CERRAR: cuando notes interés, recomienda el producto ideal, di el precio con seguridad y ${pago}

REGLAS:
- Responde siempre en español, cálido y directo.
- No prometas cosas que no están en el catálogo.
- Si el cliente dice que ya pagó o manda un comprobante, agradece y dile que lo estás verificando para entregarle su producto.
- Mantén el foco en avanzar la venta.
${extra ? '\nINSTRUCCIONES EXTRA DEL DUEÑO:\n' + extra : ''}`;
}

// Llamada de conversación (multi-turno) a Claude
async function callClaudeConversation(system, messages) {
  const key = await getSetting('anthropic_key');
  if (!key) return { error: 'nokey' };
  const model = (await getSetting('anthropic_model')) || 'claude-sonnet-5';
  let lastErr = 'La IA no respondió';
  for (let attempt = 0; attempt < 2; attempt++) {
    let d;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
      });
      d = await r.json();
      if (!r.ok) {
        lastErr = (d.error && d.error.message) || ('Error de IA (' + r.status + ')');
        if ((r.status === 429 || r.status === 500 || r.status === 529) && attempt === 0) continue; // sobrecarga -> reintenta
        return { error: lastErr };
      }
    } catch (e) { lastErr = 'No pude conectar con la IA'; if (attempt === 0) continue; return { error: lastErr }; }
    // Junta TODO el texto (no solo el primer bloque)
    const text = (d.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
    if (text) return { text };
    if (attempt === 0) continue; // vino vacío -> reintenta una vez
    return { error: 'La IA devolvió una respuesta vacía (posible sobrecarga momentánea). Reintenta.' + (d.stop_reason ? ' [' + d.stop_reason + ']' : '') };
  }
  return { error: lastErr };
}

// Probar el agente vendedor (chat de prueba)
app.post('/api/agent/chat', auth(async (req, res) => {
  const ws = req.workspace;
  let messages = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
  messages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));
  if (!messages.length) return res.status(400).json({ error: 'Escribe un mensaje' });
  if (messages[0].role !== 'user') messages = messages.slice(messages.findIndex(m => m.role === 'user'));
  const system = await buildSalesSystem(ws);
  const out = await callClaudeConversation(system, messages);
  if (out.error === 'nokey') return res.status(400).json({ error: 'Conecta tu API Key de Claude arriba para probar al agente.' });
  if (out.error) return res.status(400).json({ error: out.error });
  res.json({ reply: out.text });
}));

// ---------- Config de pagos (beneficiario por marca) ----------
app.get('/api/pagosconfig/payment-config', auth(async (req, res) => {
  res.json({ beneficiary_name: req.workspace.beneficiary_name || '', beneficiary_account: req.workspace.beneficiary_account || '' });
}));
app.post('/api/pagosconfig/payment-config', auth(async (req, res) => {
  const { beneficiary_name, beneficiary_account } = req.body || {};
  await q('UPDATE workspaces SET beneficiary_name=$1, beneficiary_account=$2 WHERE id=$3', [beneficiary_name || null, beneficiary_account || null, req.workspace.id]);
  res.json({ ok: true });
}));

// Métodos de pago (varios: cuenta bancaria, Mercado Pago link, etc.)
app.get('/api/pagosconfig/methods', auth(async (req, res) => {
  const list = await many('SELECT id,label,type,detail FROM payment_methods WHERE workspace_id=$1 ORDER BY id', [req.workspace.id]);
  res.json({ methods: list });
}));
app.post('/api/pagosconfig/methods', auth(async (req, res) => {
  const { id, label, type, detail } = req.body || {};
  if (!detail || !String(detail).trim()) return res.status(400).json({ error: 'Falta el dato (cuenta o link)' });
  if (id) {
    await q('UPDATE payment_methods SET label=$1,type=$2,detail=$3 WHERE id=$4 AND workspace_id=$5',
      [label || '', type || 'cuenta', String(detail).trim(), id, req.workspace.id]);
    return res.json({ id });
  }
  const m = await one('INSERT INTO payment_methods (workspace_id,label,type,detail) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.workspace.id, label || '', type || 'cuenta', String(detail).trim()]);
  res.json({ id: m.id });
}));
app.post('/api/pagosconfig/methods/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM payment_methods WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  res.json({ ok: true });
}));

// ---------- Productos (Media / entrega) ----------
app.post('/api/dashboard/product', auth(async (req, res) => {
  const { id, name, price, delivery_url } = req.body || {};
  if (id) {
    await q('UPDATE products SET name=$1, price=$2, delivery_url=$3 WHERE id=$4 AND workspace_id=$5', [name, Math.round(price || 0), delivery_url || null, id, req.workspace.id]);
    return res.json({ id });
  }
  const p = await one('INSERT INTO products (workspace_id,name,price,delivery_url) VALUES ($1,$2,$3,$4) RETURNING id', [req.workspace.id, name || 'Producto', Math.round(price || 0), delivery_url || null]);
  res.json({ id: p.id });
}));

// ---------- Biblioteca de archivos (media) ----------
app.post('/api/media/upload', auth(async (req, res) => {
  const { name, mime, category, data_base64 } = req.body || {};
  if (!data_base64) return res.status(400).json({ error: 'Falta el archivo' });
  const b64 = data_base64.replace(/^data:[^;]+;base64,/, '');
  const mt = mime || (data_base64.match(/^data:([^;]+);/) || [])[1] || 'application/octet-stream';
  const size = Math.round(b64.length * 3 / 4);
  if (size > 15 * 1024 * 1024) return res.status(413).json({ error: 'Archivo muy grande (máx 15MB)' });
  const m = await one('INSERT INTO media (workspace_id,name,mime,category,data,size) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.workspace.id, name || 'archivo', mt, category || 'general', b64, size]);
  const base = (await getSetting('public_url')) || (req.protocol + '://' + req.get('host'));
  res.json({ id: m.id, url: base + '/api/media/file/' + m.id, mime: mt, name: name || 'archivo' });
}));

app.get('/api/media', auth(async (req, res) => {
  const cat = req.query.category;
  const rows = cat
    ? await many('SELECT id,name,mime,category,size,created_at FROM media WHERE workspace_id=$1 AND category=$2 ORDER BY id DESC', [req.workspace.id, cat])
    : await many('SELECT id,name,mime,category,size,created_at FROM media WHERE workspace_id=$1 ORDER BY id DESC', [req.workspace.id]);
  res.json({ media: rows });
}));

// Público (para que WhatsApp pueda descargar el archivo por link)
app.get('/api/media/file/:id', h(async (req, res) => {
  const m = await one('SELECT mime,data,name FROM media WHERE id=$1', [req.params.id]);
  if (!m) return res.sendStatus(404);
  const buf = Buffer.from(m.data, 'base64');
  res.set('Content-Type', m.mime || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buf);
}));

app.post('/api/media/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM media WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  res.json({ ok: true });
}));

// ---------- Motor de comprobantes de pago ----------
async function callClaudeVision(base64, mediaType) {
  const key = await getSetting('anthropic_key');
  if (!key) return null;
  const model = (await getSetting('anthropic_model')) || 'claude-sonnet-5';
  const prompt = `Eres un verificador de comprobantes de pago (transferencias bancarias en LATAM: Nequi, Bancolombia, Mercado Pago, SPEI, etc.).
Analiza el comprobante (imagen o PDF) y responde SOLO con un JSON válido (sin texto extra) con esta forma exacta:
{"is_receipt":true/false,"amount":numero_o_null,"currency":"MXN"|"COP"|"ARS"|null,"beneficiary":"nombre_de_quien_RECIBE_o_null","account":"cuenta_CLABE_o_tarjeta_de_quien_recibe_o_null","sender":"quien_envia_o_null","reference":"num_referencia_o_null","bank":"banco_o_null","date":"fecha_o_null","tampering":true/false,"notes":"observaciones"}
Reglas:
- amount = SOLO el número del monto pagado (sin símbolos ni comas, usa punto decimal). Es el monto TRANSFERIDO/ENVIADO, no saldos ni comisiones.
- beneficiary = nombre completo de quien RECIBE el dinero (destinatario). NO pongas al que envía.
- account = número de cuenta, CLABE o tarjeta del DESTINATARIO si aparece.
- sender = nombre de quien ENVÍA (ordenante), si aparece.
- reference = folio / número de operación / clave de rastreo.
- tampering=true solo si hay señales claras de edición (fuentes inconsistentes, montos pegados, bordes raros).
Sé literal: transcribe los nombres exactamente como se ven, con acentos.`;
  // Imagen -> bloque image; PDF -> bloque document (Claude lee PDFs de forma nativa)
  const isPdf = /pdf/i.test(mediaType || '');
  const mediaBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: [
      mediaBlock,
      { type: 'text', text: prompt },
    ] }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || 'Error de IA');
  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

async function verifyReceipt(ws, extracted) {
  const reasons = [];
  let status = 'valido';
  if (!extracted || !extracted.is_receipt) { status = 'rechazado'; reasons.push('No parece un comprobante de pago'); }
  if (status !== 'rechazado' && extracted.reference) {
    const dup = await one('SELECT id FROM receipts WHERE workspace_id=$1 AND reference=$2 AND status=$3', [ws.id, String(extracted.reference), 'valido']);
    if (dup) { status = 'duplicado'; reasons.push('Referencia ya usada antes (posible fraude)'); }
  }
  // El beneficiario del comprobante debe coincidir con alguna de tus cuentas (beneficiario o métodos de pago tipo transferencia)
  const methods = await many("SELECT label,type,detail FROM payment_methods WHERE workspace_id=$1 AND type<>'link'", [ws.id]);
  const bankTargets = [];
  if (ws.beneficiary_name) bankTargets.push(ws.beneficiary_name);
  if (ws.beneficiary_account) bankTargets.push(ws.beneficiary_account);
  methods.forEach(m => { if (m.label) bankTargets.push(m.label); if (m.detail) bankTargets.push(m.detail); });
  if (status === 'valido' && bankTargets.length) {
    // Palabras genéricas que no sirven para identificar al beneficiario
    const STOP = new Set(['servicios', 'servicio', 'sa', 'sas', 'de', 'cv', 'sc', 'srl', 'ltda', 'banco', 'cuenta', 'pago', 'pagos', 'mercado', 'mp', 'the', 'del', 'los', 'las', 'and', 'llc', 'inc', 'co']);
    // Junta el nombre y también la cuenta/CLABE que la IA haya leído
    const recvRaw = [extracted.beneficiary, extracted.account, extracted.reference].filter(Boolean).join(' ');
    const bNorm = normText(recvRaw);
    const bWords = new Set(bNorm.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)));
    const bDigits = bNorm.replace(/[^0-9]/g, '');
    const ok = (bWords.size || bDigits.length >= 4) && bankTargets.some(t => {
      const tn = normText(t);
      const tWords = tn.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
      const tDigits = tn.replace(/[^0-9]/g, '');
      // Coincide si comparten alguna palabra significativa (en cualquier dirección)…
      const wordHit = tWords.some(w => bWords.has(w) || (w.length >= 4 && bNorm.includes(w)));
      // …o si coinciden los últimos dígitos de la cuenta/CLABE (4+)
      const digitHit = tDigits.length >= 4 && bDigits.length >= 4 &&
        (bDigits.includes(tDigits.slice(-6)) || bDigits.includes(tDigits.slice(-4)) || tDigits.includes(bDigits.slice(-6)) || tDigits.includes(bDigits.slice(-4)));
      return wordHit || digitHit;
    });
    if (!ok) { status = 'sospechoso'; reasons.push('El beneficiario no coincide con ninguna de tus cuentas'); }
  }
  let matchedProduct = null;
  if (extracted && extracted.amount != null) {
    const prods = await many('SELECT * FROM products WHERE workspace_id=$1', [ws.id]);
    const amt = Number(String(extracted.amount).replace(/[^0-9.]/g, ''));
    // Tolerancia: centavos exactos o ±1% para redondeos/comisiones pequeñas
    matchedProduct = prods.find(p => {
      const pr = Number(p.price);
      return Math.abs(pr - amt) < 1 || (pr > 0 && Math.abs(pr - amt) / pr <= 0.01);
    }) || null;
    if (!matchedProduct && status === 'valido') { status = 'sospechoso'; reasons.push('El monto (' + amt + ') no coincide con ningún producto'); }
  } else if (status === 'valido') { status = 'sospechoso'; reasons.push('No se pudo leer el monto'); }
  if (extracted && extracted.tampering) { status = 'sospechoso'; reasons.push('Señales de posible edición de la imagen'); }
  return { status, reason: reasons.join('; ') || 'Todo coincide', matchedProduct, extracted };
}

async function recordReceipt(ws, extracted, v, conversationId) {
  await q('INSERT INTO receipts (workspace_id,conversation_id,reference,amount,beneficiary,bank,status,reason,extracted) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [ws.id, conversationId || null, extracted.reference ? String(extracted.reference) : null, extracted.amount ? Math.round(extracted.amount) : null,
     extracted.beneficiary || null, extracted.bank || null, v.status, v.reason, JSON.stringify(extracted)]);
}

// Registra una venta para una conversación (evita duplicados). Se usa al marcar "Cliente" a mano.
async function ensureSaleForConversation(ws, conv, source) {
  const existing = await one('SELECT id FROM sales WHERE workspace_id=$1 AND conversation_id=$2', [ws.id, conv.id]);
  if (existing) return existing.id;
  // Determinar producto/monto: por el último comprobante de esa conversación, o por el único producto
  let productId = null, productName = 'Venta manual', amount = 0;
  const rc = await one("SELECT amount FROM receipts WHERE workspace_id=$1 AND conversation_id=$2 AND amount IS NOT NULL ORDER BY created_at DESC LIMIT 1", [ws.id, conv.id]);
  const prods = await many('SELECT * FROM products WHERE workspace_id=$1', [ws.id]);
  let prod = null;
  if (rc && rc.amount != null) prod = prods.find(p => Math.abs(Number(p.price) - Number(rc.amount)) < 1) || null;
  if (!prod && prods.length === 1) prod = prods[0];
  if (prod) { productId = prod.id; productName = prod.name; amount = prod.price; }
  else if (rc && rc.amount != null) { amount = rc.amount; }
  const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source,conversation_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [ws.id, productId, productName, amount, (conv.name || 'Cliente'), source || 'manual', conv.id]);
  return s.id;
}

// Simulador / prueba de comprobante (para el módulo "Simulador del bot")
app.post('/api/receipts/verify', auth(async (req, res) => {
  const ws = req.workspace;
  let extracted;
  if (req.body.simulate) {
    extracted = { is_receipt: true, tampering: false, ...req.body.simulate };
  } else if (req.body.image_base64) {
    const b64 = req.body.image_base64.replace(/^data:[^;]+;base64,/, '');
    const mt = (req.body.image_base64.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
    extracted = await callClaudeVision(b64, mt);
    if (!extracted) return res.status(400).json({ error: 'Configura tu API key de Claude en Inteligencia IA (o usa el modo "simular datos").' });
  } else return res.status(400).json({ error: 'Envía una imagen o datos a simular' });
  const v = await verifyReceipt(ws, extracted);
  await recordReceipt(ws, extracted, v, null);
  let sale = null, delivery = null;
  if (v.status === 'valido' && v.matchedProduct) {
    const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [ws.id, v.matchedProduct.id, v.matchedProduct.name, v.matchedProduct.price, 'Comprobante', 'comprobante']);
    sale = { id: s.id, product: v.matchedProduct.name };
    delivery = v.matchedProduct.delivery_url;
  }
  res.json({ verdict: v.status, reason: v.reason, extracted, product: v.matchedProduct ? v.matchedProduct.name : null, sale, delivery });
}));

app.get('/api/receipts', auth(async (req, res) => {
  const list = await many('SELECT id,reference,amount,beneficiary,bank,status,reason,created_at FROM receipts WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100', [req.workspace.id]);
  res.json({ receipts: list });
}));

// Helpers de envío por WhatsApp (para la entrega automática)
async function sendWa(to, payload) {
  const r = await sendWaResult(to, payload);
  return r.ok;
}
// Igual que sendWa pero devuelve el resultado real de Meta (para diagnosticar entregas)
async function sendWaResult(to, payload) {
  const phoneId = await getSetting('wa_phone_number_id');
  const token = await getSetting('wa_token');
  if (!phoneId || !token) return { ok: false, error: 'Falta conectar WhatsApp (Phone Number ID/token).' };
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
    });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok || d.error) {
      const msg = (d.error && (d.error.error_user_msg || d.error.message)) || ('HTTP ' + resp.status);
      const code = (d.error && (d.error.code || d.error.error_subcode)) ? (' (#' + (d.error.error_subcode || d.error.code) + ')') : '';
      const full = msg + code;
      await setSetting('wa_last_error', full);
      console.error('[sendWa] Meta rechazó:', full);
      return { ok: false, error: full };
    }
    await setSetting('wa_last_error', '');
    const id = d.messages && d.messages[0] && d.messages[0].id;
    return { ok: true, id };
  } catch (e) {
    await setSetting('wa_last_error', String(e.message || e));
    console.error('[sendWa] error de red:', e.message);
    return { ok: false, error: 'Error de red al enviar' };
  }
}
async function downloadWaMedia(mediaId) {
  const token = await getSetting('wa_token');
  const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  if (!meta.url) return null;
  const bin = await fetch(meta.url, { headers: { Authorization: 'Bearer ' + token } });
  const buf = Buffer.from(await bin.arrayBuffer());
  return { base64: buf.toString('base64'), mediaType: meta.mime_type || 'image/jpeg' };
}

// Procesa un comprobante que llega por WhatsApp (imagen o PDF) y entrega el producto si es válido
async function processIncomingReceipt(wsId, convId, from, mediaId, preMedia) {
  const ws = await one('SELECT * FROM workspaces WHERE id=$1', [wsId]);
  if (!ws) return;
  const media = preMedia || await downloadWaMedia(mediaId);
  if (!media) return;
  const extracted = await callClaudeVision(media.base64, media.mediaType);
  if (!extracted) {
    // Si era un PDF y no se pudo leer, pedir una imagen (siempre que haya IA conectada)
    if ((await getSetting('anthropic_key')) && /pdf/i.test(media.mediaType || '')) {
      await sendWa(from, { type: 'text', text: { body: 'Recibí tu comprobante en PDF pero no pude leerlo del todo 🙏. ¿Me mandas una *foto o captura de pantalla* del comprobante? Con la imagen lo confirmo al instante ✅' } });
      await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '🤖 Pidió imagen (PDF ilegible)']);
    }
    return;
  }
  const v = await verifyReceipt(ws, extracted);
  await recordReceipt(ws, extracted, v, convId);
  if (v.status === 'valido' && v.matchedProduct) {
    const dup = await one('SELECT id FROM sales WHERE workspace_id=$1 AND conversation_id=$2', [ws.id, convId]);
    if (!dup) await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source,conversation_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [ws.id, v.matchedProduct.id, v.matchedProduct.name, v.matchedProduct.price, 'Comprobante', 'comprobante', convId]);
    // Entrega como LINK (enlace clickeable), no como archivo
    const entrega = v.matchedProduct.delivery_url
      ? `✅ ¡Pago confirmado! 🎉 Aquí tienes tu acceso completo a *${v.matchedProduct.name}*:\n\n${v.matchedProduct.delivery_url}\n\n¡Gracias por tu compra! 🙌`
      : '✅ ¡Pago confirmado! 🎉 En un momento te enviamos tu acceso.';
    await sendWa(from, { type: 'text', text: { body: entrega, preview_url: true } });
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '✅ Pago confirmado, entregado (link): ' + v.matchedProduct.name]);
    await q("UPDATE conversations SET last_message=$1, last_at=now(), stage='cliente' WHERE id=$2", ['✅ Pago confirmado y entregado', convId]);
  } else {
    await sendWa(from, { type: 'text', text: { body: '🔎 Recibí tu comprobante. Lo estoy verificando y en breve te confirmo.' } });
    await q('UPDATE conversations SET bot_active=false WHERE id=$1', [convId]); // pasa a humano
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [convId, '⚠️ Comprobante para revisar (' + v.status + '): ' + v.reason]);
  }
}

// ---------- Flujos (constructor tipo GoHighLevel) ----------
app.get('/api/flows', auth(async (req, res) => {
  const list = await many('SELECT * FROM flows WHERE workspace_id=$1 ORDER BY id DESC', [req.workspace.id]);
  res.json({ flows: list });
}));
app.get('/api/flows/:id', auth(async (req, res) => {
  const f = await one('SELECT * FROM flows WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  if (!f) return res.status(404).json({ error: 'No encontrado' });
  res.json({ flow: f });
}));
app.post('/api/flows/save-flow', auth(async (req, res) => {
  const { id, name, trigger_type, trigger_value, steps, active } = req.body || {};
  const st = JSON.stringify(steps || []);
  if (id) {
    await q('UPDATE flows SET name=$1,trigger_type=$2,trigger_value=$3,steps=$4,active=$5 WHERE id=$6 AND workspace_id=$7',
      [name, trigger_type, trigger_value || null, st, active !== false, id, req.workspace.id]);
    return res.json({ id });
  }
  const f = await one('INSERT INTO flows (workspace_id,name,trigger_type,trigger_value,steps,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.workspace.id, name || 'Nuevo flujo', trigger_type || 'keyword', trigger_value || null, st, active !== false]);
  res.json({ id: f.id });
}));
app.post('/api/flows/:id/delete', auth(async (req, res) => {
  await q('DELETE FROM flows WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspace.id]);
  res.json({ ok: true });
}));

// Runtime de flujos
async function claudeReply(systemPrompt, userText) {
  const key = await getSetting('anthropic_key');
  if (!key) return null;
  const model = (await getSetting('anthropic_model')) || 'claude-sonnet-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 500, system: systemPrompt || 'Eres un asesor de ventas amable de PDFmania.', messages: [{ role: 'user', content: userText || 'Hola' }] }),
  });
  const d = await r.json();
  if (!r.ok) return null;
  return (d.content && d.content[0] && d.content[0].text) || null;
}
async function executeFlow(ws, conv, from, flow, text) {
  const steps = Array.isArray(flow.steps) ? flow.steps : JSON.parse(flow.steps || '[]');
  for (const step of steps) {
    if (step.type === 'message' && step.text) {
      await sendWa(from, { type: 'text', text: { body: step.text } });
      await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, step.text]);
    } else if (step.type === 'media' && step.url) {
      await sendWa(from, { type: 'document', document: { link: step.url, filename: (step.filename || 'archivo') } });
      await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'document')", [conv.id, '📎 ' + (step.filename || 'archivo')]);
    } else if (step.type === 'image' && step.url) {
      await sendWa(from, { type: 'image', image: { link: step.url, caption: step.caption || undefined } });
      await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'image')", [conv.id, '🖼️ imagen' + (step.caption ? ': ' + step.caption : '')]);
    } else if (step.type === 'audio' && step.url) {
      await sendWa(from, { type: 'audio', audio: { link: step.url } });
      await q("INSERT INTO messages (conversation_id,direction,body,type) VALUES ($1,'out',$2,'audio')", [conv.id, '🎤 nota de voz']);
    } else if (step.type === 'ai') {
      const reply = await claudeReply(step.prompt, text);
      if (reply) { await sendWa(from, { type: 'text', text: { body: reply } }); await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, reply]); }
    } else if (step.type === 'condition') {
      let ok = true;
      if (step.contains) {
        const low = normText(text);
        const kws = step.contains.split(/[;,]/).map(k => normText(k.trim())).filter(Boolean);
        ok = kws.some(k => low.includes(k));
      }
      if (!ok) break;
    } else if (step.type === 'takeover') {
      await q('UPDATE conversations SET bot_active=false WHERE id=$1', [conv.id]); break;
    }
  }
  await q('UPDATE conversations SET last_at=now() WHERE id=$1', [conv.id]);
}
// Normaliza: minúsculas y sin acentos (para que "mecánica" y "mecanica" coincidan)
function normText(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
async function runFlows(ws, conv, from, text) {
  const flows = await many('SELECT * FROM flows WHERE workspace_id=$1 AND active=true', [ws.id]);
  const low = normText(text);
  const msgCount = (await one('SELECT COUNT(*)::int c FROM messages WHERE conversation_id=$1', [conv.id])).c;
  for (const f of flows) {
    let match = false;
    if (f.trigger_type === 'any_message') match = true;
    else if (f.trigger_type === 'first_message') match = (msgCount <= 1);
    else if (f.trigger_type === 'keyword') {
      // Varias palabras clave separadas por ; o , — dispara si el mensaje contiene CUALQUIERA
      const kws = (f.trigger_value || '').split(/[;,]/).map(k => normText(k.trim())).filter(Boolean);
      match = kws.some(k => low.includes(k));
    }
    if (!match) continue;
    await executeFlow(ws, conv, from, f, text);
    return true; // un flujo se hizo cargo
  }
  return false;
}

// Convierte el historial de la conversación a mensajes para Claude (alterna user/assistant, empieza en user)
function toClaudeMessages(rows) {
  const msgs = [];
  for (const m of rows) {
    const role = m.direction === 'in' ? 'user' : 'assistant';
    const content = (m.body || '').trim();
    if (!content) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + content;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

// El agente vendedor responde solo, usando el historial de la conversación
async function agentAutoReply(ws, conv, from) {
  const key = await getSetting('anthropic_key');
  if (!key) return; // sin IA configurada, no responde solo
  const rows = await many('SELECT direction, body FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 16', [conv.id]);
  const msgs = toClaudeMessages(rows.reverse());
  if (!msgs.length) return;
  const system = await buildSalesSystem(ws);
  const out = await callClaudeConversation(system, msgs);
  if (out.error || !out.text) return;
  await sendWa(from, { type: 'text', text: { body: out.text } });
  await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [conv.id, out.text]);
  await q("UPDATE conversations SET last_message=$1, last_at=now(), stage=CASE WHEN stage='nuevo' THEN 'conversando' ELSE stage END WHERE id=$2",
    [out.text.slice(0, 120), conv.id]);
}

// Decide quién responde: primero los flujos; si ninguno aplica, el agente IA
async function handleBotResponse(ws, conv, from, body) {
  const handled = await runFlows(ws, conv, from, body);
  if (handled) return;
  await agentAutoReply(ws, conv, from);
}

// ---------- Alertas inteligentes + Telegram ----------
async function productAdsBreakdown(userId) {
  const workspaces = await many('SELECT * FROM workspaces WHERE user_id=$1', [userId]);
  const prodMap = {};
  for (const w of workspaces) {
    const c = await one('SELECT fx FROM countries WHERE code=$1', [w.country_code]);
    const fx = (c && c.fx) || 1;
    const sbp = await many('SELECT product_name, COALESCE(SUM(amount),0)::float8 s, COUNT(*)::int u FROM sales WHERE workspace_id=$1 GROUP BY product_name', [w.id]);
    sbp.forEach(s => { prodMap[s.product_name] = prodMap[s.product_name] || { revenue: 0, spend: 0, unidades: 0 }; prodMap[s.product_name].revenue += s.s / fx; prodMap[s.product_name].unidades += s.u; });
  }
  const codes = workspaces.map(w => w.country_code);
  const spendByProd = await many('SELECT product, COALESCE(SUM(spend_usd),0)::float8 s FROM ad_spend WHERE country_code = ANY($1::text[]) AND product IS NOT NULL GROUP BY product', [codes]);
  spendByProd.forEach(x => { prodMap[x.product] = prodMap[x.product] || { revenue: 0, spend: 0, unidades: 0 }; prodMap[x.product].spend += x.s; });
  return Object.entries(prodMap).map(([name, v]) => ({ product: name, revenue: v.revenue, spend: v.spend, unidades: v.unidades, roas: v.spend > 0 ? v.revenue / v.spend : null }))
    .filter(p => p.spend > 0 || p.revenue > 0).sort((a, b) => b.spend - a.spend);
}
const money2 = n => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function computeAlerts(userId) {
  const alerts = [];
  const fin = await computeFinanceForUser(userId);
  for (const r of fin.rows) {
    if (r.revenue === 0 && r.spend === 0) continue;
    if (r.neto < 0) alerts.push({ level: 'pausar', icon: '⛔', title: 'Pérdida en ' + r.name, detail: 'NETO negativo (' + money2(r.neto) + '). Reduce gasto o revisa el embudo.' });
    else if (r.estado === 'Escalar') alerts.push({ level: 'escalar', icon: '🚀', title: 'Escala ' + r.name, detail: 'ROAS ' + r.roas.toFixed(2) + ' y NETO positivo. Sube el presupuesto.' });
    else if (r.estado === 'Pausar') alerts.push({ level: 'pausar', icon: '⏸️', title: 'Pausa/reduce ' + r.name, detail: 'ROAS bajo (' + (r.roas ? r.roas.toFixed(2) : '—') + '). Estás cerca de perder.' });
    else if (r.estado === 'Mantener') alerts.push({ level: 'revisar', icon: '👀', title: 'Vigila ' + r.name, detail: 'ROAS ' + r.roas.toFixed(2) + ' (mantener). Optimiza para escalar.' });
  }
  const byProduct = await productAdsBreakdown(userId);
  for (const p of byProduct) {
    if (p.spend <= 0) continue;
    if (p.roas != null && p.roas > 2) alerts.push({ level: 'escalar', icon: '🚀', title: 'Escala producto: ' + p.product, detail: 'ROAS ' + p.roas.toFixed(2) + '. Rentable — mete más presupuesto.' });
    else if (p.roas != null && p.roas >= 1.5) alerts.push({ level: 'revisar', icon: '👀', title: 'Revisa producto: ' + p.product, detail: 'ROAS ' + p.roas.toFixed(2) + '. Margen justo, optimiza creativos.' });
    else alerts.push({ level: 'pausar', icon: '⏸️', title: 'Reduce/pausa producto: ' + p.product, detail: 'ROAS ' + (p.roas ? p.roas.toFixed(2) : '—') + '. No es rentable ahora.' });
  }
  const order = { pausar: 0, escalar: 1, revisar: 2, info: 3 };
  alerts.sort((a, b) => (order[a.level] - order[b.level]));
  return alerts;
}

app.get('/api/alerts', auth(async (req, res) => {
  const alerts = await computeAlerts(req.user.id);
  const tgChat = (await getSetting('tg_chat')) || '';
  res.json({ alerts, telegramConfigured: !!(await getSetting('tg_token')) && !!tgChat, tgChat });
}));
app.get('/api/user/telegram', auth(async (req, res) => {
  res.json({ configured: !!(await getSetting('tg_token')) && !!(await getSetting('tg_chat')), chat_id: (await getSetting('tg_chat')) || '' });
}));
app.post('/api/user/telegram', auth(async (req, res) => {
  const { bot_token, chat_id } = req.body || {};
  if (bot_token) await setSetting('tg_token', bot_token);
  if (chat_id != null) await setSetting('tg_chat', chat_id);
  res.json({ ok: true });
}));
app.post('/api/alerts/send-telegram', auth(async (req, res) => {
  const token = await getSetting('tg_token'); const chat = await getSetting('tg_chat');
  if (!token || !chat) return res.status(400).json({ error: 'Configura Telegram primero (bot token + chat id).' });
  const alerts = await computeAlerts(req.user.id);
  const text = '🔔 *Alertas PDFmania*\n\n' + (alerts.length ? alerts.map(a => a.icon + ' *' + a.title + '*\n' + a.detail).join('\n\n') : 'Todo en orden ✅');
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }),
    });
    const d = await r.json();
    if (!d.ok) return res.status(400).json({ error: d.description || 'Error de Telegram' });
    res.json({ ok: true, sent: alerts.length });
  } catch (e) { res.status(502).json({ error: 'No se pudo contactar Telegram' }); }
}));

// ---------- Remarketing (segmentos + campañas) ----------
const SEGMENTS = {
  interesados: { label: 'Interesados (sin compra)', where: "NOT EXISTS(SELECT 1 FROM receipts r WHERE r.conversation_id=c.id AND r.status='valido')" },
  revision: { label: 'Comprobante en revisión', where: "EXISTS(SELECT 1 FROM receipts r WHERE r.conversation_id=c.id AND r.status IN ('sospechoso','duplicado','rechazado')) AND NOT EXISTS(SELECT 1 FROM receipts r2 WHERE r2.conversation_id=c.id AND r2.status='valido')" },
  clientes: { label: 'Clientes (ya compraron)', where: "EXISTS(SELECT 1 FROM receipts r WHERE r.conversation_id=c.id AND r.status='valido')" },
  inactivos: { label: 'Inactivos +7 días', where: "c.last_at < now()-interval '7 days'" },
};
async function segmentRecipients(wsId, key) {
  const seg = SEGMENTS[key]; if (!seg) return [];
  return many(`SELECT c.id, c.wa_id, c.name FROM conversations c WHERE c.workspace_id=$1 AND (${seg.where})`, [wsId]);
}
app.get('/api/remarketing/segments', auth(async (req, res) => {
  const out = [];
  for (const [key, seg] of Object.entries(SEGMENTS)) {
    const r = await one(`SELECT COUNT(*)::int c FROM conversations c WHERE c.workspace_id=$1 AND (${seg.where})`, [req.workspace.id]);
    out.push({ key, label: seg.label, count: r.c });
  }
  res.json({ segments: out });
}));
app.get('/api/remarketing', auth(async (req, res) => {
  const list = await many('SELECT * FROM remarketing WHERE workspace_id=$1 ORDER BY id DESC LIMIT 100', [req.workspace.id]);
  res.json({ campaigns: list, segmentLabels: Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, v.label])) });
}));
app.post('/api/remarketing', auth(async (req, res) => {
  const { name, segment, message } = req.body || {};
  if (!segment || !message) return res.status(400).json({ error: 'Segmento y mensaje requeridos' });
  const recipients = await segmentRecipients(req.workspace.id, segment);
  let sent = 0;
  for (const rc of recipients) {
    try { await sendWa(rc.wa_id, { type: 'text', text: { body: message } }); } catch (e) {}
    await q("INSERT INTO messages (conversation_id,direction,body) VALUES ($1,'out',$2)", [rc.id, message]).catch(() => {});
    await q('UPDATE conversations SET last_message=$1, last_at=now() WHERE id=$2', [message, rc.id]).catch(() => {});
    sent++;
  }
  const camp = await one('INSERT INTO remarketing (workspace_id,name,segment,message,sent) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.workspace.id, name || 'Campaña', segment, message, sent]);
  res.json({ id: camp.id, sent, recipients: recipients.length });
}));

// ---------- Webhook público: registro AUTOMÁTICO de ventas ----------
app.post('/api/webhooks/sale', h(async (req, res) => {
  const secret = req.query.secret || (req.body && req.body.secret);
  if (secret !== WEBHOOK_SECRET) return res.status(401).json({ error: 'Secret inválido' });
  const { workspace_id, product_name, amount, customer_name, source } = req.body || {};
  const ws = await one('SELECT * FROM workspaces WHERE id=$1', [workspace_id]);
  if (!ws) return res.status(404).json({ error: 'Marca no encontrada' });
  if (!amount) return res.status(400).json({ error: 'Monto requerido' });
  const prod = await one('SELECT id FROM products WHERE workspace_id=$1 AND name=$2', [ws.id, product_name || '']);
  const s = await one('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [ws.id, prod ? prod.id : null, product_name || 'Venta', Math.round(amount), customer_name || 'Cliente', source || 'webhook']);
  res.json({ ok: true, id: s.id });
}));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- Páginas legales (para publicar la app en Meta) ----------
function legalPage(title, bodyHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · PDFmania</title>
<style>
body{background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.7;margin:0;padding:40px 20px}
.wrap{max-width:760px;margin:0 auto}
h1{color:#fff;font-size:28px;margin-bottom:4px}
h2{color:#fff;font-size:18px;margin-top:32px}
.date{color:#888;font-size:14px;margin-bottom:24px}
a{color:#fff}
p,li{color:#cfcfcf;font-size:15px}
.foot{margin-top:40px;padding-top:20px;border-top:1px solid #222;color:#777;font-size:13px}
</style></head><body><div class="wrap">${bodyHtml}
<div class="foot">PDFmania · Contacto: <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a></div>
</div></body></html>`;
}

app.get('/privacidad', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(legalPage('Política de Privacidad', `
  <h1>Política de Privacidad</h1>
  <div class="date">PDFmania — Última actualización: 2026</div>
  <p>En PDFmania ("nosotros") respetamos tu privacidad. Esta política explica qué datos recopilamos, cómo los usamos y tus derechos. Al comunicarte con nosotros por WhatsApp o comprar nuestros productos digitales, aceptas lo aquí descrito.</p>

  <h2>1. Quiénes somos</h2>
  <p>PDFmania comercializa productos digitales (guías, plantillas y cursos en formato PDF) que se atienden y entregan a través de WhatsApp. Puedes contactarnos en <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>.</p>

  <h2>2. Qué información recopilamos</h2>
  <ul>
    <li><b>Datos de contacto:</b> tu número de teléfono y nombre de WhatsApp cuando nos escribes.</li>
    <li><b>Mensajes:</b> el contenido de las conversaciones necesarias para atender tu consulta y tu compra.</li>
    <li><b>Comprobantes de pago:</b> cuando envías una imagen de comprobante, procesamos el monto, la referencia y el beneficiario únicamente para verificar y confirmar tu compra.</li>
    <li><b>Datos de la compra:</b> producto adquirido y estado de entrega.</li>
  </ul>

  <h2>3. Para qué usamos tus datos</h2>
  <ul>
    <li>Responder tus consultas y brindarte atención al cliente.</li>
    <li>Verificar pagos y entregar automáticamente el producto adquirido.</li>
    <li>Enviarte información relacionada con tu compra.</li>
  </ul>
  <p>No vendemos ni alquilamos tus datos personales a terceros.</p>

  <h2>4. WhatsApp y Meta</h2>
  <p>Usamos la API oficial de WhatsApp Business (Meta Platforms, Inc.) para enviar y recibir mensajes. El tratamiento de datos dentro de WhatsApp se rige también por las políticas de Meta.</p>

  <h2>5. Conservación de datos</h2>
  <p>Conservamos tus datos solo el tiempo necesario para prestarte el servicio y cumplir obligaciones legales. Puedes solicitar su eliminación cuando quieras.</p>

  <h2>6. Tus derechos</h2>
  <p>Puedes solicitar acceder, corregir o eliminar tus datos escribiendo a <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>. Atenderemos tu solicitud en un plazo razonable.</p>

  <h2>7. Eliminación de datos</h2>
  <p>Para eliminar tus datos, envía un correo a <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a> con el asunto "Eliminar mis datos" desde el mismo contacto, o escríbenos por WhatsApp. Eliminaremos tu información de nuestros sistemas.</p>

  <h2>8. Cambios</h2>
  <p>Podemos actualizar esta política. La versión vigente estará siempre disponible en esta página.</p>
  `));
});

app.get('/terminos', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(legalPage('Términos del Servicio', `
  <h1>Términos del Servicio</h1>
  <div class="date">PDFmania — Última actualización: 2026</div>
  <p>Estos términos regulan la compra y el uso de los productos digitales de PDFmania. Al realizar una compra, los aceptas.</p>

  <h2>1. Productos</h2>
  <p>PDFmania vende productos digitales (archivos PDF: guías, plantillas y cursos). La entrega es digital, a través de WhatsApp, tras confirmar el pago.</p>

  <h2>2. Pagos</h2>
  <p>El pago se realiza por transferencia u otros medios indicados. La compra se confirma al verificar el comprobante (monto y beneficiario correctos). Cada comprobante es válido una sola vez.</p>

  <h2>3. Entrega</h2>
  <p>Una vez verificado el pago, el producto se entrega de forma automática por WhatsApp. Si no recibes tu producto, escríbenos a <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>.</p>

  <h2>4. Naturaleza digital</h2>
  <p>Por tratarse de productos digitales de entrega inmediata, las devoluciones aplican solo en caso de error comprobado en la entrega. Ante cualquier inconveniente, contáctanos y buscaremos una solución justa.</p>

  <h2>5. Uso permitido</h2>
  <p>Los productos son para uso personal del comprador. No está permitida su reventa ni distribución no autorizada.</p>

  <h2>6. Contacto</h2>
  <p>Para cualquier duda: <a href="mailto:soporte@captaclick.com">soporte@captaclick.com</a>.</p>
  `));
});

// Root -> app (index.html autocontenido en la raíz). no-store: nunca cachear el HTML.
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Arranque: inicializa la base y siembra si está vacía
(async () => {
  try {
    await init();
    await seed();
    app.listen(PORT, () => console.log(`PDFmania corriendo en http://localhost:${PORT}`));
  } catch (e) {
    console.error('Error al iniciar:', e);
    process.exit(1);
  }
})();

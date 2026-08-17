// db.js - Capa de datos Postgres (Supabase en producción)
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// En producción: DATABASE_URL de Supabase (con SSL). En local: variables PG* estándar.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 10 })
  : new Pool({ max: 10 });

const q = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const many = async (text, params) => (await pool.query(text, params)).rows;

async function init() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      google_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      country_code TEXT DEFAULT 'CO',
      currency TEXT DEFAULT 'COP',
      timezone TEXT DEFAULT 'America/Bogota',
      flag TEXT DEFAULT '🇨🇴',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      name TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      amount BIGINT NOT NULL DEFAULT 0,
      customer_name TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS countries (
      code TEXT PRIMARY KEY,
      cobrador REAL DEFAULT 0,
      procesador REAL DEFAULT 0,
      andres REAL DEFAULT 15,
      proc_name TEXT,
      fx REAL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ad_spend (
      id SERIAL PRIMARY KEY,
      country_code TEXT NOT NULL,
      campaign TEXT,
      spend_usd REAL DEFAULT 0,
      date DATE DEFAULT current_date
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      wa_id TEXT NOT NULL,
      name TEXT,
      last_message TEXT,
      last_at TIMESTAMPTZ DEFAULT now(),
      bot_active BOOLEAN DEFAULT true,
      unread INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (workspace_id, wa_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      body TEXT,
      type TEXT DEFAULT 'text',
      wa_message_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER,
      conversation_id INTEGER,
      reference TEXT,
      amount BIGINT,
      beneficiary TEXT,
      bank TEXT,
      status TEXT,
      reason TEXT,
      extracted JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS flows (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      trigger_type TEXT DEFAULT 'keyword',
      trigger_value TEXT,
      steps JSONB DEFAULT '[]',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS remarketing (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      name TEXT,
      segment TEXT,
      message TEXT,
      sent INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER,
      name TEXT,
      mime TEXT,
      category TEXT DEFAULT 'general',
      data TEXT,
      size INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_url TEXT;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS beneficiary_name TEXT;
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS beneficiary_account TEXT;
    ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS product TEXT;
    ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'nuevo';
    CREATE TABLE IF NOT EXISTS payment_methods (
      id SERIAL PRIMARY KEY, workspace_id INTEGER, label TEXT, type TEXT DEFAULT 'cuenta', detail TEXT, created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS conversation_id INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id INTEGER;
  `);
}

function daysAgo(days, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const COUNTRIES = [
  { name: 'PDFmania Colombia',   cc: 'CO', cur: 'COP', tz: 'America/Bogota',                 flag: '🇨🇴' },
  { name: 'PDFmania Argentina',  cc: 'AR', cur: 'ARS', tz: 'America/Argentina/Buenos_Aires', flag: '🇦🇷' },
  { name: 'PDFmania México',     cc: 'MX', cur: 'MXN', tz: 'America/Mexico_City',            flag: '🇲🇽' },
  { name: 'PDFmania Costa Rica', cc: 'CR', cur: 'CRC', tz: 'America/Costa_Rica',             flag: '🇨🇷' },
  { name: 'PDFmania Guatemala',  cc: 'GT', cur: 'GTQ', tz: 'America/Guatemala',              flag: '🇬🇹' },
  { name: 'PDFmania RD',         cc: 'DO', cur: 'DOP', tz: 'America/Santo_Domingo',          flag: '🇩🇴' },
];
const CATALOG = {
  CO: [['Guía PDF Premium', 100000], ['Curso Express Ventas', 54000], ['Pack Plantillas Pro', 30000], ['Ebook Automatización', 45000]],
  AR: [['Guía PDF Premium', 15000], ['Curso Express Ventas', 9000], ['Pack Plantillas Pro', 5000]],
  MX: [['Guía PDF Premium', 500], ['Curso Express Ventas', 300], ['Pack Plantillas Pro', 180]],
  CR: [['Guía PDF Premium', 12000], ['Curso Express Ventas', 7000]],
  GT: [['Guía PDF Premium', 200], ['Curso Express Ventas', 120]],
  DO: [['Guía PDF Premium', 5000], ['Curso Express Ventas', 2700]],
};
const SALES_PLAN = {
  CO: [28, 26, 24, 22, 20, 18, 16, 14, 11, 9, 6, 3, 2, 1],
  AR: [21, 17, 12, 8, 5, 2], MX: [19, 14, 9, 4, 1], DO: [15, 8, 3],
};
const NCONTACTS = { CO: 57, AR: 34, MX: 41, DO: 22 };
const COMM = [
  ['AR', 10, 1.5, 15, 'DollarApp', 1000], ['CO', 0, 5.9, 25, 'Stripe', 4000],
  ['CR', 10, 5.9, 15, 'Stripe', 520], ['DO', 0, 1.5, 15, 'DollarApp', 60],
  ['GT', 10, 5.9, 15, 'Stripe', 7.7], ['VE', 12, 1, 15, 'USDT', 40],
  ['MX', 10, 4.5, 15, 'Mercado Pago', 18], ['PE', 10, 4.5, 15, 'Pasarela', 3.75],
  ['EC', 10, 5.9, 15, 'Stripe', 1],
];
// [país, campaña, producto, gasto_usd]  (la campaña se etiqueta a un producto)
const ADS = [
  ['CO', 'Advantage+ Guía', 'Guía PDF Premium', 63], ['CO', 'Retargeting Curso', 'Curso Express Ventas', 27],
  ['AR', 'Advantage+ Guía', 'Guía PDF Premium', 23.8], ['AR', 'Retargeting Curso', 'Curso Express Ventas', 10.2],
  ['MX', 'Advantage+ Guía', 'Guía PDF Premium', 49], ['MX', 'Retargeting Curso', 'Curso Express Ventas', 21],
  ['DO', 'Advantage+ Guía', 'Guía PDF Premium', 17.5], ['DO', 'Retargeting Curso', 'Curso Express Ventas', 7.5],
];
const clientes = ['María G.', 'Carlos R.', 'Ana P.', 'Luis M.', 'Sofía T.', 'Jorge V.', 'Elena D.', 'Pedro S.'];

async function seed() {
  const existing = await one('SELECT COUNT(*)::int c FROM users');
  if (existing && existing.c > 0) { console.log('DB ya tiene datos, no se vuelve a sembrar.'); return; }
  console.log('Sembrando datos de prueba (PDFmania)...');

  const hash = bcrypt.hashSync('demo1234', 10);
  const u = await one('INSERT INTO users (email,password_hash,name) VALUES ($1,$2,$3) RETURNING id', ['demo@pdfmania.co', hash, 'Equipo PDFmania']);
  const userId = u.id;

  let coWsId = null;
  for (const co of COUNTRIES) {
    const ws = await one('INSERT INTO workspaces (user_id,name,country_code,currency,timezone,flag) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [userId, co.name, co.cc, co.cur, co.tz, co.flag]);
    const wsId = ws.id;
    if (co.cc === 'CO') coWsId = wsId;
    const catalog = CATALOG[co.cc] || [];
    const prodIds = {}, priceOf = {};
    for (const [n, p] of catalog) {
      const pr = await one('INSERT INTO products (workspace_id,name,price,delivery_url) VALUES ($1,$2,$3,$4) RETURNING id',
        [wsId, n, p, 'https://ejemplo.com/entrega/' + encodeURIComponent(n) + '.pdf']);
      prodIds[n] = pr.id; priceOf[n] = p;
    }
    await q('UPDATE workspaces SET beneficiary_name=$1, beneficiary_account=$2 WHERE id=$3',
      ['PDFmania ' + co.cc, 'Cuenta ' + co.cc + ' · 300-000-' + co.cc, wsId]);
    const nContacts = NCONTACTS[co.cc] || 8;
    for (let i = 1; i <= nContacts; i++) await q('INSERT INTO contacts (workspace_id,name,phone) VALUES ($1,$2,$3)', [wsId, 'Contacto ' + i, '+000' + (1000 + i)]);
    const plan = SALES_PLAN[co.cc] || [];
    const names = catalog.map(x => x[0]);
    for (let i = 0; i < plan.length; i++) {
      const name = names[i % names.length];
      await q('INSERT INTO sales (workspace_id,product_id,product_name,amount,customer_name,source,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [wsId, prodIds[name], name, priceOf[name], clientes[i % clientes.length], 'whatsapp', daysAgo(plan[i], 9 + (i % 8))]);
    }
  }
  for (const r of COMM) await q('INSERT INTO countries (code,cobrador,procesador,andres,proc_name,fx) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO UPDATE SET cobrador=EXCLUDED.cobrador,procesador=EXCLUDED.procesador,andres=EXCLUDED.andres,proc_name=EXCLUDED.proc_name,fx=EXCLUDED.fx', r);
  for (const r of ADS) await q('INSERT INTO ad_spend (country_code,campaign,product,spend_usd) VALUES ($1,$2,$3,$4)', r);

  // Conversaciones de ejemplo para la bandeja de Chat en Vivo
  if (coWsId) {
    const convos = [
      { wa: '573001112233', name: 'Laura Méndez', bot: false, msgs: [['in', 'Hola, quiero la Guía PDF Premium'], ['out', '¡Hola Laura! Claro, te paso el link de pago 😊'], ['in', 'Perfecto, gracias']] },
      { wa: '573004445566', name: 'Andrés Gómez', bot: true, msgs: [['in', '¿El curso incluye plantillas?'], ['out', 'Sí, incluye el pack de plantillas pro.']] },
      { wa: '573007778899', name: 'Cliente nuevo', bot: true, msgs: [['in', 'Info por favor']] },
    ];
    for (const c of convos) {
      const last = c.msgs[c.msgs.length - 1];
      const conv = await one('INSERT INTO conversations (workspace_id,wa_id,name,last_message,bot_active,unread) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [coWsId, c.wa, c.name, last[1], c.bot, last[0] === 'in' ? 1 : 0]);
      for (const m of c.msgs) await q('INSERT INTO messages (conversation_id,direction,body) VALUES ($1,$2,$3)', [conv.id, m[0], m[1]]);
    }
    // Flujo de ejemplo
    const demoSteps = [
      { type: 'message', text: '¡Hola! 👋 Bienvenido a PDFmania. ¿Qué producto te interesa?' },
      { type: 'ai', prompt: 'Actúa como asesor de ventas amable. Ayuda al cliente a elegir un producto digital y dile el precio.' },
      { type: 'message', text: 'Cuando hagas la transferencia, envíame la foto del comprobante y te entrego tu producto al instante. 🧾' },
    ];
    await q('INSERT INTO flows (workspace_id,name,trigger_type,trigger_value,steps,active) VALUES ($1,$2,$3,$4,$5,$6)',
      [coWsId, 'Bienvenida y venta', 'keyword', 'hola', JSON.stringify(demoSteps), true]);
    // Campaña de remarketing de ejemplo
    await q('INSERT INTO remarketing (workspace_id,name,segment,message,sent) VALUES ($1,$2,$3,$4,$5)',
      [coWsId, 'Recordatorio de oferta', 'interesados', '¡Hola! 👋 Aún puedes llevar la Guía PDF Premium con 20% off hoy. ¿Te animas?', 3]);
  }

  console.log('Seed listo. Usuario demo: demo@pdfmania.co / demo1234');
}

module.exports = { pool, q, one, many, init, seed, COUNTRIES, CATALOG };

if (require.main === module) {
  (async () => { await init(); await seed(); await pool.end(); })().catch(e => { console.error(e); process.exit(1); });
}

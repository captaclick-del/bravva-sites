# PDFmania — Reconstrucción (Fase 1)

Plataforma centralizada de ventas, chat y automatización para productos digitales (PDFmania).
Esta entrega es la **Fase 1**: base del proyecto + autenticación + multi-marca + dashboard visual con datos de prueba. Tema **blanco y negro**.

## Qué incluye esta fase

- **Login / Registro** con JWT (y un botón de **Acceso demo** para entrar directo a ver la plataforma).
- **Multi-marca (workspaces)** por país: **PDFmania Colombia, Argentina, México, Costa Rica, Guatemala y RD**, cada una con su moneda (COP, ARS, MXN, CRC, GTQ, DOP) y zona horaria. Botón "Crear nueva marca".
- **Dashboard** idéntico al original: banner, tarjetas de métricas (ingresos hoy, ingresos 30 días, conversión, producto ganador), gráfico de ventas (30 días) con Chart.js, Top clientes y Ventas por producto.
- El resto de módulos (Cloud API, Chat, WhatsApp, Flujos, IA, Pagos, etc.) están en el menú y se implementan en las siguientes fases.

## ⚠️ Importante: NO abras index.html con doble clic

Esto es una **aplicación con servidor**, no una página suelta. Si abres el archivo
directamente (file://...) se verá sin estilos y dará "Failed to fetch". Hay que iniciarla.

## Forma fácil (Mac) — doble clic

1. Descomprime la carpeta.
2. Haz **doble clic en `Iniciar-PDFmania.command`**.
   - Si macOS lo bloquea: **clic derecho → Abrir → Abrir**.
3. Se abre solo en el navegador. Deja la ventana negra (Terminal) abierta mientras la usas.

Requiere tener **Node.js** instalado (https://nodejs.org, versión LTS). El propio
lanzador te avisa si falta.

## Publicar en producción (recomendado)

La app usa **Postgres (Supabase)**, así los datos **nunca se borran** aunque se
reinicie. Sigue la guía **`DEPLOY.md`** (Supabase + Railway, paso a paso).

## Correr localmente (opcional, para desarrollo)

Requiere **Node.js 18+** y una base Postgres. Crea un archivo `.env` con la
conexión (tu Supabase, o un Postgres local):

```bash
# .env
DATABASE_URL=postgresql://usuario:password@host:5432/basedatos
JWT_SECRET=algo-largo
WEBHOOK_SECRET=algo-largo
```

```bash
npm install
npm start        # crea el esquema y siembra datos de prueba la primera vez
```

Luego abre **http://localhost:3000** → botón **"Acceso demo"** o `demo@pdfmania.co` / `demo1234`.

> ¿Solo quieres VER el diseño sin instalar nada? Abre `PDFmania-DEMO.html` (demo offline).

## Estructura

```
helios/
├─ server.js            # API REST (Express): auth, workspaces, dashboard, finanzas, ads, webhook
├─ db.js                # Capa Postgres (esquema + seed). En prod usa DATABASE_URL (Supabase)
├─ public/
│  ├─ index.html        # App completa (login + dashboard + finanzas + cuenta publicitaria)
│  └─ vendor/           # Tailwind + Chart.js (locales, sin depender de CDNs)
├─ Dockerfile           # Imagen de producción
├─ DEPLOY.md            # Guía para publicar (Supabase + Railway)
├─ tailwind.config.js   # Config de estilos
└─ package.json
```

## Si editas los estilos (clases de Tailwind)

```bash
npm run build:css
```

## Endpoints ya funcionando

- `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/dev-login`
- `GET /api/auth/account` · `GET /api/auth/config`
- `GET /api/workspaces` · `POST /api/workspaces` · `POST /api/auth/switch-workspace`
- `GET /api/dashboard/sales` · `GET /api/dashboard/sales-list` · `GET /api/dashboard/products`
- `GET /api/finance/waterfall`  → NETO Jonás consolidado + waterfall por país (parte 4)
- `GET /api/ads/spend` · `POST /api/ads/connect` · `POST /api/ads/disconnect`  → cuenta Meta
- `POST /api/webhooks/sale`  → **registro automático de ventas** (ver abajo)

## Reporte automático de ventas (webhook)

Cuando un pago se confirma (pasarela / GoHighLevel), se dispara este webhook y la venta
entra sola al panel:

```
POST /api/webhooks/sale?secret=pdfmania-demo
Content-Type: application/json
{ "workspace_id": 1, "product_name": "Guía PDF Premium", "amount": 100000, "customer_name": "Juan" }
```

Cambia el secret con la variable de entorno `WEBHOOK_SECRET`. El monto va en la moneda local
de la marca; el panel lo convierte a USD para el NETO.

## Modelo financiero (parte 4)

Las comisiones por país (cobrador / procesador / Andrés) y las tasas a USD viven en la tabla
`countries` (editables). El waterfall se calcula en el servidor:
`Revenue − Cobrador − Procesador − Gasto = GB Ajustada − Andrés = NETO Jonás`
(Andrés nunca cobra sobre pérdida). El gasto de Meta está en la tabla `ad_spend`.

## Próximas fases

- **Fase 2:** ventas + reporte automático (webhook de pagos → registra venta sola).
- **Fase 3:** chat en vivo + WhatsApp (Cloud API) + bot con IA.
- **Fase 4:** Meta Ads, media, remarketing, equipo, notificaciones.

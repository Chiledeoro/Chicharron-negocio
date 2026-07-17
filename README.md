# Chicharrón de Chile — Sistema de Control de Negocio

Esta es la versión lista para poner en internet (Railway) de tu app de control de
producción, ventas, gastos, clientes y caja.

Es exactamente la misma app que ya probaste, con todos los últimos cambios
(cerrar lotes, aviso de deudas de más de 15 días, modo oscuro, folios L#/V#/G#,
abonos parciales, cartera de clientes, respaldo de datos, etc.) — solo que ahora
guarda todo en una base de datos propia en vez del guardado de Claude.

## ¿Qué trae esta carpeta?

- `server.js` — el "cerebro" que conecta la app con la base de datos
- `public/index.html` — la app que ya conoces (lotes, ventas, gastos, clientes, caja)
- `package.json` — la lista de piezas que necesita para funcionar

## Cómo subirlo a Railway (paso a paso)

### 1. Sube esta carpeta a GitHub

1. Entra a [github.com](https://github.com) y crea una cuenta si no tienes.
2. Crea un repositorio nuevo (botón verde "New").
3. Sube todos los archivos de esta carpeta a ese repositorio (puedes arrastrar
   los archivos directo desde la página de GitHub, en la opción "uploading an
   existing file").

### 2. Crea tu cuenta en Railway

1. Entra a [railway.com](https://railway.com).
2. Regístrate con tu cuenta de GitHub (botón "Sign in with GitHub").
3. Al crear la cuenta te dan un crédito gratis de $5 USD por 30 días para probar
   sin comprometerte a pagar todavía.

### 3. Crea el proyecto

1. Dentro de Railway, dale clic a **"New Project"**.
2. Elige **"Deploy from GitHub repo"**.
3. Selecciona el repositorio que acabas de subir.
4. Railway va a detectar que es una app de Node.js sola y va a empezar a
   instalarla — espera un par de minutos.

### 4. Agrega la base de datos

1. Dentro de tu proyecto en Railway, dale clic a **"+ New"** (o "New Service").
2. Elige **"Database"** → **"Add PostgreSQL"**.
3. Railway crea la base de datos sola y la conecta automáticamente con tu app
   (esto se llama variable `DATABASE_URL` — no tienes que escribirla a mano).
4. **Importante:** si no se conecta sola, ve a tu servicio de la app → pestaña
   **"Variables"** → verás un aviso que dice *"Trying to connect a database?
   Add Variable"* — dale clic ahí y selecciona **`DATABASE_URL`** de Postgres.

### 5. Configura tu usuario administrador (¡nuevo!)

Ahora la app pide iniciar sesión. Antes de entrar por primera vez, configura estas
variables en tu servicio de la app (pestaña **"Variables"** → "+ New Variable"):

| Variable | Para qué sirve | Ejemplo |
|---|---|---|
| `ADMIN_USER` | El usuario con el que vas a entrar tú como administrador | `aldo` |
| `ADMIN_PASSWORD` | Tu contraseña | (algo que solo tú sepas) |
| `JWT_SECRET` | Una palabra secreta para proteger las sesiones | cualquier texto largo al azar |

Si no configuras `ADMIN_USER` y `ADMIN_PASSWORD`, la app crea un usuario admin
por default (`admin` / `chicharron123`) — **cámbialo en cuanto puedas entrar**,
o mejor, configura las variables desde el principio para que no exista ese
usuario por default.

Una vez que entres con tu cuenta de administrador, ve a la pestaña **🔑
Usuarios** dentro de la app para crear el acceso de tu esposa y tu hermana —
ellas van a poder capturar todo (lotes, ventas, gastos, clientes) pero **no
podrán editar ni eliminar** nada, solo tú como administrador puedes hacer eso.

### 6. Actívalo

1. Ve a la pestaña **"Settings"** de tu servicio (el de la app, no el de la
   base de datos).
2. En la sección **"Networking"**, dale clic a **"Generate Domain"**.
3. Railway te da una dirección tipo `tu-app.up.railway.app` — esa es la que
   vas a usar tú, tu esposa y tu hermana para entrar a la app desde cualquier
   aparato.

### 7. Prueba antes de pagar

Con el crédito gratis de $5 ya puedes probar todo — que capturen lotes, ventas,
gastos, y que revisen que todo se vea y funcione bien desde sus celulares.

### 8. Activa el plan de pago (cuando ya estés convencido)

1. Ve a **"Billing"** en el menú de tu cuenta.
2. Activa el plan **Hobby** ($5 USD/mes) para que la app se quede corriendo
   sin interrupciones después de que se acabe el crédito gratis.

¡Listo! Cada vez que quieras hacerle un cambio a la app, solo tienes que subir
el archivo actualizado a GitHub y Railway lo vuelve a poner en línea solo.

## Notas técnicas (por si algún día alguien más le entra al código)

- Todos los datos se guardan en una sola tabla (`app_data`) con una columna de
  tipo JSON — el mismo modelo de datos que ya usaba la versión de prueba, solo
  que ahora vive en Postgres en vez del guardado de Claude.
- El servidor expone dos rutas: `GET /api/estado` (trae todo) y
  `POST /api/estado` (guarda todo). El frontend llama a estas rutas en vez de
  usar `window.storage`.
- Si más adelante quieres separar los datos en tablas de verdad (una tabla de
  lotes, una de ventas, etc.) para reportes más avanzados, este es el punto de
  partida perfecto para hacerlo — el modelo de un solo documento fue una
  decisión para lanzar rápido y simple.

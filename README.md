# Sistema de gestión de mesas y sillas

Reservas, préstamos y devoluciones (completas y parciales) de **mesas** y **sillas**, con inventario único y consistente en **PostgreSQL (Neon)**.

- **Backend:** Node.js + Express (API REST), `pg`, JWT, bcrypt
- **Base de datos:** PostgreSQL en Neon (`DATABASE_URL`)
- **Frontend:** HTML5 + CSS3 + JavaScript + Bootstrap 5 (CDN), servido por el mismo Express
- **Despliegue:** Render (un solo servicio web)

El frontend **nunca calcula** cantidades: cada operación se ejecuta en una transacción (`BEGIN … COMMIT`, `ROLLBACK` ante error) con bloqueo de filas (`SELECT … FOR UPDATE`) sobre el inventario, y PostgreSQL garantiza la consistencia con restricciones `CHECK` (`total = disponibles + reservadas + prestadas`, sin negativos).

## Estructura

```
mesas-sillas/
├── package.json            (scripts para Render)
├── render.yaml             (blueprint opcional)
├── database/schema.sql     (tablas, enums, índices, triggers y datos de prueba)
├── database/migrations/    (001_pagos_simulados.sql: para bases que ya existían)
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── app.js
│       ├── config/db.js
│       ├── controllers/  middleware/  routes/  services/  models/  utils/
└── frontend/
    ├── index.html login.html dashboard.html inventario.html reservas.html
    ├── prestamos.html devoluciones.html pagos.html historial.html usuarios.html
    ├── css/styles.css
    └── js/ (api.js, layout.js, pago.js (modal de cobro) y un archivo por página)
```

## 1. Crear la base de datos en Neon

1. Entra a <https://neon.tech> y crea una cuenta (o inicia sesión).
2. **Create project** → ponle un nombre (p. ej. `mesas-sillas`) y elige la región más cercana.
3. En el panel del proyecto pulsa **Connect** y copia la **connection string** (formato `postgresql://usuario:clave@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`). Esa es tu `DATABASE_URL`.
4. **No la subas a GitHub.** Solo va en `.env` (local) y en las variables de entorno de Render.

## 2. Ejecutar `schema.sql`

`schema.sql` debe ejecutarse sobre una base **vacía** (crea tablas, tipos ENUM, índices, restricciones y datos de prueba).

**Opción A – Editor SQL de Neon (la más simple):** abre **SQL Editor**, pega todo el contenido de `database/schema.sql` y pulsa **Run**.

**Opción B – `psql`:**
```bash
psql "TU_DATABASE_URL" -f database/schema.sql
```

**Opción C – desde Node:** con el `.env` ya configurado (paso 3):
```bash
cd backend && npm run db:schema
```

Para reiniciar desde cero, descomenta el bloque `DROP` al inicio de `schema.sql` (¡borra todos los datos!).

### ¿Ya tenías la base creada? Migra a pagos (sin perder datos)

Si tu base se creó con la versión anterior (sin precios ni pagos), **no** vuelvas a ejecutar `schema.sql`; aplica la migración. Es idempotente (puedes ejecutarla más de una vez):

```bash
cd backend && npm run db:migrate          # o pega database/migrations/001_pagos_simulados.sql en el SQL Editor de Neon
```

Las reservas existentes quedan **sin costo** (no se cobra retroactivamente) y los recursos reciben precios de ejemplo (mesa $5.00, silla $1.00) que puedes cambiar en *Inventario*.

## 3. Configurar `.env`

```bash
cd backend
cp .env.example .env
```

Edita `backend/.env`:

```
DATABASE_URL=postgresql://usuario:clave@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=una-clave-larga-y-aleatoria-de-32-caracteres-o-mas
PORT=10000
NODE_ENV=production
```

Genera un `JWT_SECRET` seguro con: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Variables opcionales: `JWT_EXPIRES_IN` (por defecto `8h`), `APP_TIMEZONE` (por defecto `America/El_Salvador`, se usa para validar "fecha no anterior a hoy"), `CORS_ORIGIN` (solo si sirves el frontend desde otro dominio; lista separada por comas) y `DB_SSL=false` (solo para una base PostgreSQL local sin SSL) y `PAGO_SIM_LATENCIA_MS` (demora simulada de la pasarela de pagos, por defecto `900`; usa `0` para pruebas).

## 4. Ejecutar localmente

Requiere Node.js 18 o superior.

```bash
cd backend
npm install
npm start          # o: npm run dev  (reinicia al guardar)
```

Abre <http://localhost:10000> e inicia sesión con un usuario de prueba. El estado del servidor y la BD: <http://localhost:10000/health>.

## 5. Conectar con GitHub

```bash
cd mesas-sillas
git init
git add .
git commit -m "Sistema de mesas y sillas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mesas-sillas.git
git push -u origin main
```

Antes crea el repositorio vacío en GitHub (**New repository**). El `.gitignore` ya excluye `node_modules/` y `.env`; verifica con `git status` que `.env` **no** aparece.

## 6. Desplegar en Render

1. En <https://render.com> → **New +** → **Web Service** → conecta tu cuenta de GitHub y elige el repositorio.
2. Configura:
   - **Runtime:** Node
   - **Root Directory:** *(déjalo vacío; el backend sirve la carpeta `frontend` que está fuera de `backend/`)*
   - **Build Command:** `npm install --prefix backend`
   - **Start Command:** `npm start --prefix backend`
   - **Health Check Path:** `/health`
3. En **Environment** agrega las variables:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la connection string de Neon |
| `JWT_SECRET` | clave aleatoria larga |
| `NODE_ENV` | `production` |
| `PORT` | `10000` (Render lo define solo; es opcional) |

4. **Create Web Service**. Al terminar, Render te da una URL `https://tu-servicio.onrender.com`. (También puedes usar `render.yaml` con **New + → Blueprint**.)

Nota: en el plan gratuito el servicio se "duerme" tras un rato sin tráfico y la primera petición tarda unos segundos.

## 7. Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| ADMIN | `admin@demo.com` | `Admin123!` |
| USER | `ana@demo.com` | `Usuario123!` |
| USER | `luis@demo.com` | `Usuario123!` |

**Cambia estas contraseñas (o elimina estos usuarios) antes de usar el sistema en serio.** El registro público (`/api/auth/register`) siempre crea usuarios con rol `USER`; solo un administrador puede crear otros administradores.

Datos de prueba iniciales: 100 mesas y 200 sillas, con 1 reserva confirmada (5 mesas / 30 sillas), 1 pendiente, 1 finalizada, 1 cancelada, 2 préstamos (uno parcialmente devuelto y otro vencido) y su historial.

## 8. Reglas de negocio

- **Reserva PENDIENTE:** no aparta inventario. **CONFIRMADA:** mueve `disponible → reservada`. Un administrador puede crearla ya confirmada (`"confirmar": true`).
- **Cancelar** una reserva confirmada devuelve `reservada → disponible`. Una reserva cancelada o finalizada no admite más operaciones.
- **Préstamo desde reserva:** `reservada → prestada` y la reserva pasa a `FINALIZADA`. **Préstamo directo:** `disponible → prestada`.
- **Devolución:** `prestada → disponible`. Si queda algo pendiente el préstamo es `PARCIALMENTE_DEVUELTO` (o `VENCIDO` si ya pasó la fecha prevista); si no, `DEVUELTO`. No se puede devolver más de lo pendiente.
- Los préstamos con pendientes y fecha prevista vencida pasan automáticamente a `VENCIDO` al consultar préstamos o el dashboard.
- Cada operación inserta filas en `movimientos` (solo inserción: un trigger impide `UPDATE`/`DELETE`, así el historial no se pierde).
- `DELETE /api/reservas/:id` **cancela** la reserva (no borra filas, para conservar el historial).
- El inventario puede modificarse (`PUT /api/inventario/:id`), pero el total nunca puede quedar por debajo de lo reservado + prestado.
- Las reservas no controlan solapamiento horario: el inventario es un contador global (como pide el enunciado). La fecha/hora son informativas y se evita duplicar la misma reserva (mismo usuario, fecha y horario).

## 9. Probar la API

Reemplaza `URL` por `http://localhost:10000` o tu URL de Render.

```bash
URL=http://localhost:10000

# Login (guarda el token)
TOKEN=$(curl -s -X POST $URL/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.token")

# Inventario y dashboard
curl -s $URL/api/inventario -H "Authorization: Bearer $TOKEN"
curl -s $URL/api/dashboard  -H "Authorization: Bearer $TOKEN"

# Crear una reserva ya confirmada (admin) – 30 sillas
curl -s -X POST $URL/api/reservas -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"usuario_id":2,"fecha":"2030-01-15","hora_inicio":"09:00","hora_fin":"13:00","cantidad_mesas":0,"cantidad_sillas":30,"confirmar":true}'

# Convertir la reserva en préstamo
curl -s -X POST $URL/api/prestamos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reserva_id":5,"fecha_prevista_devolucion":"2030-01-20T18:00:00Z"}'

# Devolución parcial (15 sillas) y luego el resto
curl -s -X POST $URL/api/devoluciones -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"prestamo_id":3,"cantidad_sillas":15}'

# Historial
curl -s "$URL/api/historial?tipo=PRESTAMO" -H "Authorization: Bearer $TOKEN"
```

## Pagos simulados

> **Es una simulación.** No se contacta a ninguna pasarela ni se mueve dinero real. **No ingreses datos de tarjetas verdaderas.**

- **Precios:** cada recurso tiene un `precio_unitario` (USD). El total de una reserva = Σ cantidad × precio. El precio se **congela** en cada línea al crearla: cambiar el precio en Inventario no altera reservas existentes.
- **Pagar:** `POST /api/reservas/:id/pagar` cobra siempre el **saldo pendiente**; el monto lo calcula el servidor (nunca se acepta del cliente). Se puede pagar una reserva `PENDIENTE`, `CONFIRMADA` o `FINALIZADA`, no una `CANCELADA`.
- **Métodos:** `TARJETA` (cualquier usuario sobre sus reservas; el admin sobre cualquiera) y `EFECTIVO` (solo ADMIN, cobro en mostrador).
- **Sin doble cobro:** la reserva se bloquea durante el cobro, así que un doble clic o varias pestañas solo producen un pago aprobado.
- **Reembolsos automáticos (simulados):** al cancelar una reserva pagada se devuelve todo lo pagado; si se modifica a un total menor, se devuelve la diferencia; si queda mayor, la reserva muestra un saldo por pagar (pago *parcial*).
- **Estado de pago** (derivado, en cada reserva): `PENDIENTE` (por pagar) · `PARCIAL` · `PAGADO` · `SIN_COSTO` · `REEMBOLSADO` · `NO_APLICA`.
- **Libro de pagos** (`pagos`): solo inserción (un trigger impide `UPDATE`/`DELETE`; un error se corrige con un reembolso). Los intentos rechazados también quedan registrados. Cada pago/reembolso aprobado deja además un movimiento `PAGO`/`REEMBOLSO` en el historial.
- **Datos de tarjeta:** el número completo y el CVV solo existen en memoria durante la petición; en la base se guardan únicamente la marca y los últimos 4 dígitos.

**Tarjetas de prueba** (también disponibles en el desplegable del formulario de pago; cualquier otra tarjeta con Luhn válido se aprueba):

| Número | Resultado |
|---|---|
| `4242 4242 4242 4242` (Visa) · `5555 5555 5555 4444` (Mastercard) | Aprobada |
| `3782 822463 10005` (Amex, CVV de 4 dígitos) | Aprobada |
| `4000 0000 0000 0002` | Rechazada por el banco emisor |
| `4000 0000 0000 9995` | Fondos insuficientes |
| `4000 0000 0000 0069` | Tarjeta vencida |
| `4000 0000 0000 0127` | CVC incorrecto |

Usa cualquier vencimiento futuro (p. ej. `12/30`) y CVV de 3 dígitos. Un número inválido (Luhn), un vencimiento pasado real o un CVV mal formado se rechazan con HTTP 400 y **no** generan transacción; un rechazo del "banco" responde HTTP 402 y sí queda registrado.

Para sustituir la simulación por una pasarela real basta con reemplazar `autorizar()` en `backend/src/services/pasarela.simulada.js` (mismo contrato).

### Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/register` | público |
| GET | `/api/auth/me`, `/api/dashboard`, `/api/inventario` | ADMIN, USER |
| POST / PUT | `/api/inventario`, `/api/inventario/:id` | ADMIN |
| GET | `/api/reservas`, `/api/reservas/:id` | ADMIN (todas) · USER (solo las suyas) |
| POST / PUT / DELETE | `/api/reservas`, `/api/reservas/:id` | ADMIN · USER (solo las suyas y pendientes para modificar) |
| POST | `/api/reservas/:id/confirmar` | ADMIN |
| POST | `/api/reservas/:id/cancelar` | ADMIN · USER (propias) |
| GET | `/api/prestamos`, `/api/prestamos/:id` | ADMIN · USER (propios) |
| POST / PUT | `/api/prestamos`, `/api/prestamos/:id` | ADMIN |
| GET | `/api/devoluciones` | ADMIN · USER (propias) |
| POST | `/api/devoluciones` | ADMIN |
| POST | `/api/reservas/:id/pagar` | ADMIN (cualquiera, tarjeta o efectivo) · USER (propias, solo tarjeta) |
| GET | `/api/pagos`, `/api/pagos/simulador` | ADMIN (todos) · USER (solo los suyos) |
| GET | `/api/historial` | ADMIN |
| GET / POST / PUT | `/api/usuarios`, `/api/usuarios/:id` | ADMIN |

Filtros disponibles: `reservas?estado=&q=&fecha=&usuario_id=`, `prestamos?estado=&q=&usuario_id=`, `historial?tipo=&desde=&hasta=&q=&limit=&offset=`, `pagos?tipo=&estado=&metodo=&reserva_id=&desde=&hasta=&q=&limit=&offset=` (devuelve `{ pagos, resumen }`; el resumen cubre todos los registros filtrados).

Todas las respuestas tienen la forma `{ "ok": true, "data": ... }` o `{ "ok": false, "error": "mensaje" }`.

## Seguridad

pagos con monto calculado en el servidor y sin guardar datos sensibles de tarjeta · bcrypt (10 rondas) para contraseñas · JWT (el usuario se revalida en BD en cada petición, por lo que desactivar un usuario surte efecto de inmediato) · autorización por roles · consultas parametrizadas · `helmet` · CORS restringido al mismo origen salvo `CORS_ORIGIN` · errores centralizados sin filtrar detalles internos · `DATABASE_URL` y `JWT_SECRET` solo en variables de entorno.

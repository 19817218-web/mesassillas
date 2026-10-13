-- =====================================================================
-- SISTEMA DE GESTIÓN DE MESAS Y SILLAS - ESQUEMA COMPLETO (PostgreSQL / Neon)
-- Ejecutar sobre una base de datos VACÍA (ver README).
-- Usuarios de prueba:  admin@demo.com / Admin123!   |   ana@demo.com, luis@demo.com / Usuario123!
-- =====================================================================

-- Para reiniciar todo (¡BORRA LOS DATOS!) descomenta este bloque:
-- DROP TABLE IF EXISTS pagos, movimientos, devolucion_detalle, devoluciones, prestamo_detalle,
--   prestamos, reserva_detalle, reservas, recursos, usuarios CASCADE;
-- DROP TYPE IF EXISTS estado_transaccion, metodo_pago, tipo_pago, tipo_movimiento, estado_prestamo,
--   estado_reserva, estado_recurso, tipo_recurso, rol_usuario;
-- DROP FUNCTION IF EXISTS fn_movimientos_inmutables(), fn_pagos_inmutables();

BEGIN;

-- ---------- TIPOS ENUM ----------
CREATE TYPE rol_usuario      AS ENUM ('ADMIN', 'USER');
CREATE TYPE tipo_recurso     AS ENUM ('MESA', 'SILLA');
CREATE TYPE estado_recurso   AS ENUM ('ACTIVO', 'INACTIVO');
CREATE TYPE estado_reserva   AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'FINALIZADA');
CREATE TYPE estado_prestamo  AS ENUM ('PENDIENTE', 'ACTIVO', 'PARCIALMENTE_DEVUELTO', 'DEVUELTO', 'VENCIDO');
CREATE TYPE tipo_movimiento  AS ENUM ('RESERVA', 'CANCELACION', 'PRESTAMO', 'DEVOLUCION', 'DEVOLUCION_PARCIAL', 'MODIFICACION',
                                      'PAGO', 'REEMBOLSO');
-- Pagos (simulados)
CREATE TYPE tipo_pago          AS ENUM ('COBRO', 'REEMBOLSO');
CREATE TYPE metodo_pago        AS ENUM ('TARJETA', 'EFECTIVO');
CREATE TYPE estado_transaccion AS ENUM ('APROBADO', 'RECHAZADO');

-- ---------- 1. USUARIOS ----------
CREATE TABLE usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL CHECK (length(trim(nombre)) > 0),
  email          VARCHAR(160) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  VARCHAR(100) NOT NULL,
  rol            rol_usuario  NOT NULL DEFAULT 'USER',
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- 2. RECURSOS / INVENTARIO ----------
CREATE TABLE recursos (
  id                  SERIAL PRIMARY KEY,
  tipo                tipo_recurso   NOT NULL UNIQUE,
  nombre              VARCHAR(80)    NOT NULL,
  cantidad_total      INTEGER        NOT NULL DEFAULT 0 CHECK (cantidad_total      >= 0),
  cantidad_disponible INTEGER        NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
  cantidad_reservada  INTEGER        NOT NULL DEFAULT 0 CHECK (cantidad_reservada  >= 0),
  cantidad_prestada   INTEGER        NOT NULL DEFAULT 0 CHECK (cantidad_prestada   >= 0),
  estado              estado_recurso NOT NULL DEFAULT 'ACTIVO',
  -- Precio de alquiler por unidad y por reserva (USD)
  precio_unitario     NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  -- Invariante: total = disponible + reservada + prestada (siempre)
  CONSTRAINT chk_recursos_balance CHECK (
    cantidad_total = cantidad_disponible + cantidad_reservada + cantidad_prestada)
);

-- ---------- 3. RESERVAS ----------
CREATE TABLE reservas (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER        NOT NULL REFERENCES usuarios(id),
  fecha         DATE           NOT NULL,
  hora_inicio   TIME           NOT NULL,
  hora_fin      TIME           NOT NULL,
  estado        estado_reserva NOT NULL DEFAULT 'PENDIENTE',
  observaciones TEXT,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT chk_reservas_horas CHECK (hora_fin > hora_inicio)
);
CREATE INDEX idx_reservas_usuario ON reservas(usuario_id);
CREATE INDEX idx_reservas_estado_fecha ON reservas(estado, fecha);
-- Evita reservas duplicadas (mismo usuario, fecha y horario) mientras estén vigentes
CREATE UNIQUE INDEX uq_reservas_duplicadas
  ON reservas(usuario_id, fecha, hora_inicio, hora_fin)
  WHERE estado IN ('PENDIENTE', 'CONFIRMADA');

-- ---------- 4. DETALLE DE RESERVAS ----------
CREATE TABLE reserva_detalle (
  id          SERIAL PRIMARY KEY,
  reserva_id  INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  recurso_id  INTEGER NOT NULL REFERENCES recursos(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  -- Precio vigente cuando se creó la línea: cambiar el precio del recurso no altera reservas existentes
  precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  UNIQUE (reserva_id, recurso_id)
);

-- ---------- 5. PRÉSTAMOS ----------
CREATE TABLE prestamos (
  id                         SERIAL PRIMARY KEY,
  usuario_id                 INTEGER         NOT NULL REFERENCES usuarios(id),
  reserva_id                 INTEGER         UNIQUE REFERENCES reservas(id),
  registrado_por             INTEGER         NOT NULL REFERENCES usuarios(id),
  fecha_prestamo             TIMESTAMPTZ     NOT NULL DEFAULT now(),
  fecha_prevista_devolucion  TIMESTAMPTZ     NOT NULL,
  estado                     estado_prestamo NOT NULL DEFAULT 'ACTIVO',
  observaciones              TEXT,
  created_at                 TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT chk_prestamos_fechas CHECK (fecha_prevista_devolucion >= fecha_prestamo)
);
CREATE INDEX idx_prestamos_usuario ON prestamos(usuario_id);
CREATE INDEX idx_prestamos_estado ON prestamos(estado, fecha_prevista_devolucion);

-- ---------- 6. DETALLE DE PRÉSTAMOS ----------
CREATE TABLE prestamo_detalle (
  id                SERIAL PRIMARY KEY,
  prestamo_id       INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  recurso_id        INTEGER NOT NULL REFERENCES recursos(id),
  cantidad_prestada INTEGER NOT NULL CHECK (cantidad_prestada > 0),
  cantidad_devuelta INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0),
  UNIQUE (prestamo_id, recurso_id),
  CONSTRAINT chk_prestamo_detalle_devuelta CHECK (cantidad_devuelta <= cantidad_prestada)
);

-- ---------- 7. DEVOLUCIONES ----------
CREATE TABLE devoluciones (
  id             SERIAL PRIMARY KEY,
  prestamo_id    INTEGER     NOT NULL REFERENCES prestamos(id),
  registrado_por INTEGER     NOT NULL REFERENCES usuarios(id),
  fecha_real     TIMESTAMPTZ NOT NULL DEFAULT now(),
  observaciones  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_devoluciones_prestamo ON devoluciones(prestamo_id);

-- ---------- 8. DETALLE DE DEVOLUCIONES ----------
CREATE TABLE devolucion_detalle (
  id            SERIAL PRIMARY KEY,
  devolucion_id INTEGER NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  recurso_id    INTEGER NOT NULL REFERENCES recursos(id),
  cantidad      INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE (devolucion_id, recurso_id)
);

-- ---------- 9. MOVIMIENTOS / HISTORIAL ----------
-- Sin ON DELETE CASCADE: el historial nunca se pierde.
CREATE TABLE movimientos (
  id               BIGSERIAL PRIMARY KEY,
  usuario_id       INTEGER         NOT NULL REFERENCES usuarios(id),
  tipo             tipo_movimiento NOT NULL,
  recurso_id       INTEGER         REFERENCES recursos(id),
  cantidad         INTEGER         NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  fecha            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  estado_anterior  VARCHAR(60),
  estado_posterior VARCHAR(60),
  reserva_id       INTEGER         REFERENCES reservas(id),
  prestamo_id      INTEGER         REFERENCES prestamos(id),
  devolucion_id    INTEGER         REFERENCES devoluciones(id),
  descripcion      TEXT            NOT NULL
);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha DESC);
CREATE INDEX idx_movimientos_tipo ON movimientos(tipo);
CREATE INDEX idx_movimientos_reserva ON movimientos(reserva_id);
CREATE INDEX idx_movimientos_prestamo ON movimientos(prestamo_id);

-- Protege el historial: no se permite modificar ni borrar movimientos
CREATE OR REPLACE FUNCTION fn_movimientos_inmutables() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla movimientos es de solo inserción (historial inmutable)';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_movimientos_inmutables
  BEFORE UPDATE OR DELETE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_movimientos_inmutables();

-- ---------- 10. PAGOS (SIMULADOS) ----------
-- Libro de transacciones: cada fila es un intento de cobro (aprobado o rechazado) o un reembolso.
-- Saldo pagado de una reserva = SUM(COBRO aprobados) - SUM(REEMBOLSO aprobados).
-- NUNCA se guarda el número completo de la tarjeta ni el CVV: solo marca y últimos 4 dígitos.
CREATE TABLE pagos (
  id               SERIAL PRIMARY KEY,
  reserva_id       INTEGER            NOT NULL REFERENCES reservas(id),
  registrado_por   INTEGER            NOT NULL REFERENCES usuarios(id),
  tipo             tipo_pago          NOT NULL,
  metodo           metodo_pago        NOT NULL,
  estado           estado_transaccion NOT NULL,
  monto            NUMERIC(10,2)      NOT NULL CHECK (monto > 0),
  moneda           CHAR(3)            NOT NULL DEFAULT 'USD',
  referencia       VARCHAR(30)        NOT NULL UNIQUE,
  tarjeta_marca    VARCHAR(20),
  tarjeta_ultimos4 CHAR(4),
  codigo_error     VARCHAR(40),
  mensaje          VARCHAR(200),
  pago_origen_id   INTEGER            REFERENCES pagos(id),
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
  -- Los reembolsos solo se registran cuando se aprueban
  CONSTRAINT chk_pagos_reembolso_aprobado CHECK (tipo = 'COBRO' OR estado = 'APROBADO'),
  -- Un pago con tarjeta siempre identifica la tarjeta (marca + últimos 4)
  CONSTRAINT chk_pagos_tarjeta CHECK (metodo <> 'TARJETA' OR tarjeta_ultimos4 IS NOT NULL),
  CONSTRAINT chk_pagos_ultimos4 CHECK (tarjeta_ultimos4 IS NULL OR tarjeta_ultimos4 ~ '^[0-9]{4}$')
);
CREATE INDEX idx_pagos_reserva ON pagos(reserva_id);
CREATE INDEX idx_pagos_created ON pagos(created_at DESC);

-- Protege los registros financieros: no se modifican ni se borran (un error se corrige con un reembolso)
CREATE OR REPLACE FUNCTION fn_pagos_inmutables() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla pagos es de solo inserción (los registros financieros no se modifican)';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_pagos_inmutables
  BEFORE UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_pagos_inmutables();

-- =====================================================================
-- DATOS DE PRUEBA (ficticios)
-- =====================================================================
INSERT INTO usuarios (id, nombre, email, password_hash, rol) VALUES
 (1, 'Administrador Demo', 'admin@demo.com', '$2a$10$pYadIKwsJQKhImN7LIKU3e9VuU0CGFY89qdJFysO0JI.xbFYfhr2S', 'ADMIN'),
 (2, 'Ana Martínez',       'ana@demo.com',   '$2a$10$kZicXP63QEQrYssN4VXnN.Oiaw2x/FF.9HAShm93KuCziSO5VQufu', 'USER'),
 (3, 'Luis Hernández',     'luis@demo.com',  '$2a$10$kZicXP63QEQrYssN4VXnN.Oiaw2x/FF.9HAShm93KuCziSO5VQufu', 'USER');

-- Escenario de prueba (mesas / sillas):
--   Reservada (reserva 1 CONFIRMADA): 5 / 30
--   Prestada pendiente: préstamo 1 -> 6 / 25 ; préstamo 2 -> 3 / 10   => 9 / 35
--   Disponible: mesas 100-5-9 = 86 ; sillas 200-30-35 = 135
-- Precios de ejemplo (USD por unidad y por reserva); el administrador puede cambiarlos en Inventario
INSERT INTO recursos (id, tipo, nombre, cantidad_total, cantidad_disponible, cantidad_reservada, cantidad_prestada, precio_unitario) VALUES
 (1, 'MESA',  'Mesas',  100,  86,  5,  9, 5.00),
 (2, 'SILLA', 'Sillas', 200, 135, 30, 35, 1.00);

INSERT INTO reservas (id, usuario_id, fecha, hora_inicio, hora_fin, estado, observaciones, created_at) VALUES
 (1, 2, CURRENT_DATE + 3, '09:00', '13:00', 'CONFIRMADA', 'Evento familiar',               now() - interval '2 days'),
 (2, 3, CURRENT_DATE + 5, '14:00', '18:00', 'PENDIENTE',  'Reunión de vecinos',            now() - interval '1 day'),
 (3, 2, CURRENT_DATE - 4, '08:00', '12:00', 'FINALIZADA', 'Feria escolar (ya prestada)',   now() - interval '6 days'),
 (4, 3, CURRENT_DATE + 1, '10:00', '12:00', 'CANCELADA',  'Cancelada por el usuario',      now() - interval '3 days');

INSERT INTO reserva_detalle (reserva_id, recurso_id, cantidad, precio_unitario) VALUES
 (1, 1, 5, 5.00), (1, 2, 30, 1.00),     -- total $55.00
 (2, 1, 2, 5.00), (2, 2, 20, 1.00),     -- total $30.00
 (3, 1, 10, 5.00), (3, 2, 40, 1.00),    -- total $90.00
 (4, 1, 1, 5.00), (4, 2, 10, 1.00);     -- total $15.00

INSERT INTO prestamos (id, usuario_id, reserva_id, registrado_por, fecha_prestamo, fecha_prevista_devolucion, estado, observaciones) VALUES
 (1, 2, 3,    1, now() - interval '4 days', now() + interval '2 days', 'PARCIALMENTE_DEVUELTO', 'Préstamo de la reserva #3'),
 (2, 3, NULL, 1, now() - interval '5 days', now() - interval '2 days', 'VENCIDO',               'Préstamo directo, pendiente de devolver');

INSERT INTO prestamo_detalle (prestamo_id, recurso_id, cantidad_prestada, cantidad_devuelta) VALUES
 (1, 1, 10, 4), (1, 2, 40, 15),
 (2, 1,  3, 0), (2, 2, 10, 0);

INSERT INTO devoluciones (id, prestamo_id, registrado_por, fecha_real, observaciones) VALUES
 (1, 1, 1, now() - interval '1 day', 'Primera devolución parcial');
INSERT INTO devolucion_detalle (devolucion_id, recurso_id, cantidad) VALUES (1, 1, 4), (1, 2, 15);

INSERT INTO movimientos (usuario_id, tipo, recurso_id, cantidad, fecha, estado_anterior, estado_posterior, reserva_id, prestamo_id, devolucion_id, descripcion) VALUES
 (2, 'RESERVA',            1, 10, now() - interval '6 days', NULL,         'PENDIENTE',             3, NULL, NULL, 'Reserva #3 creada'),
 (2, 'RESERVA',            2, 40, now() - interval '6 days', NULL,         'PENDIENTE',             3, NULL, NULL, 'Reserva #3 creada'),
 (1, 'RESERVA',            1, 10, now() - interval '6 days', 'PENDIENTE',  'CONFIRMADA',            3, NULL, NULL, 'Reserva #3 confirmada'),
 (1, 'RESERVA',            2, 40, now() - interval '6 days', 'PENDIENTE',  'CONFIRMADA',            3, NULL, NULL, 'Reserva #3 confirmada'),
 (1, 'PRESTAMO',           1, 10, now() - interval '4 days', 'CONFIRMADA', 'ACTIVO',               3, 1,    NULL, 'Reserva #3 convertida en préstamo #1'),
 (1, 'PRESTAMO',           2, 40, now() - interval '4 days', 'CONFIRMADA', 'ACTIVO',               3, 1,    NULL, 'Reserva #3 convertida en préstamo #1'),
 (1, 'PRESTAMO',           1,  3, now() - interval '5 days', NULL,         'ACTIVO',               NULL, 2, NULL, 'Préstamo directo #2'),
 (1, 'PRESTAMO',           2, 10, now() - interval '5 days', NULL,         'ACTIVO',               NULL, 2, NULL, 'Préstamo directo #2'),
 (1, 'DEVOLUCION_PARCIAL', 1,  4, now() - interval '1 day',  'ACTIVO',     'PARCIALMENTE_DEVUELTO', NULL, 1, 1,    'Devolución parcial del préstamo #1'),
 (1, 'DEVOLUCION_PARCIAL', 2, 15, now() - interval '1 day',  'ACTIVO',     'PARCIALMENTE_DEVUELTO', NULL, 1, 1,    'Devolución parcial del préstamo #1'),
 (2, 'RESERVA',            1,  5, now() - interval '2 days', NULL,         'PENDIENTE',             1, NULL, NULL, 'Reserva #1 creada'),
 (2, 'RESERVA',            2, 30, now() - interval '2 days', NULL,         'PENDIENTE',             1, NULL, NULL, 'Reserva #1 creada'),
 (1, 'RESERVA',            1,  5, now() - interval '2 days', 'PENDIENTE',  'CONFIRMADA',            1, NULL, NULL, 'Reserva #1 confirmada'),
 (1, 'RESERVA',            2, 30, now() - interval '2 days', 'PENDIENTE',  'CONFIRMADA',            1, NULL, NULL, 'Reserva #1 confirmada'),
 (3, 'RESERVA',            1,  2, now() - interval '1 day',  NULL,         'PENDIENTE',             2, NULL, NULL, 'Reserva #2 creada'),
 (3, 'RESERVA',            2, 20, now() - interval '1 day',  NULL,         'PENDIENTE',             2, NULL, NULL, 'Reserva #2 creada'),
 (3, 'RESERVA',            1,  1, now() - interval '3 days', NULL,         'PENDIENTE',             4, NULL, NULL, 'Reserva #4 creada'),
 (3, 'CANCELACION',        1,  1, now() - interval '3 days', 'PENDIENTE',  'CANCELADA',             4, NULL, NULL, 'Reserva #4 cancelada');

-- Pagos de ejemplo (simulados):
--   Reserva 1 (confirmada, $55): pagada con tarjeta por Ana.
--   Reserva 2 (pendiente, $30):  un intento rechazado de Luis; sigue SIN PAGAR (sirve para probar el flujo).
--   Reserva 3 (finalizada, $90): pagada en efectivo en mostrador.
--   Reserva 4 (cancelada, $15):  se cobró con tarjeta y, al cancelarse, se reembolsó completa.
INSERT INTO pagos (id, reserva_id, registrado_por, tipo, metodo, estado, monto, referencia, tarjeta_marca, tarjeta_ultimos4,
                   codigo_error, mensaje, pago_origen_id, created_at) VALUES
 (1, 3, 1, 'COBRO',     'EFECTIVO', 'APROBADO',  90.00, 'EFE-SEED00001', NULL,         NULL,   NULL,            NULL,                                      NULL, now() - interval '6 days'),
 (2, 1, 2, 'COBRO',     'TARJETA',  'APROBADO',  55.00, 'SIM-SEED00002', 'VISA',       '4242', NULL,            NULL,                                      NULL, now() - interval '2 days'),
 (3, 2, 3, 'COBRO',     'TARJETA',  'RECHAZADO', 30.00, 'SIM-SEED00003', 'VISA',       '0002', 'card_declined', 'La tarjeta fue rechazada por el banco emisor', NULL, now() - interval '1 day'),
 (4, 4, 3, 'COBRO',     'TARJETA',  'APROBADO',  15.00, 'SIM-SEED00004', 'MASTERCARD', '4444', NULL,            NULL,                                      NULL, now() - interval '3 days' - interval '1 hour'),
 (5, 4, 3, 'REEMBOLSO', 'TARJETA',  'APROBADO',  15.00, 'SIM-SEED00005', 'MASTERCARD', '4444', NULL,            'Cancelación de la reserva #4',            4,    now() - interval '3 days');

INSERT INTO movimientos (usuario_id, tipo, recurso_id, cantidad, fecha, estado_anterior, estado_posterior, reserva_id, descripcion) VALUES
 (1, 'PAGO',      NULL, 0, now() - interval '6 days',                       'PENDIENTE', 'PAGADO', 3, 'Pago de $90.00 de la reserva #3 en efectivo (ref EFE-SEED00001)'),
 (2, 'PAGO',      NULL, 0, now() - interval '2 days',                       'PENDIENTE', 'PAGADO', 1, 'Pago de $55.00 de la reserva #1 con tarjeta VISA ••4242 (ref SIM-SEED00002)'),
 (3, 'PAGO',      NULL, 0, now() - interval '3 days' - interval '1 hour',   'PENDIENTE', 'PAGADO', 4, 'Pago de $15.00 de la reserva #4 con tarjeta MASTERCARD ••4444 (ref SIM-SEED00004)'),
 (3, 'REEMBOLSO', NULL, 0, now() - interval '3 days',                       'PAGADO', 'REEMBOLSADO', 4, 'Reembolso de $15.00 de la reserva #4 a tarjeta MASTERCARD ••4444 (ref SIM-SEED00005): Cancelación de la reserva #4');

-- Ajusta las secuencias después de insertar IDs explícitos
SELECT setval(pg_get_serial_sequence('usuarios','id'),    (SELECT max(id) FROM usuarios));
SELECT setval(pg_get_serial_sequence('recursos','id'),    (SELECT max(id) FROM recursos));
SELECT setval(pg_get_serial_sequence('reservas','id'),    (SELECT max(id) FROM reservas));
SELECT setval(pg_get_serial_sequence('prestamos','id'),   (SELECT max(id) FROM prestamos));
SELECT setval(pg_get_serial_sequence('devoluciones','id'),(SELECT max(id) FROM devoluciones));
SELECT setval(pg_get_serial_sequence('pagos','id'),       (SELECT max(id) FROM pagos));

COMMIT;

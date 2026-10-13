-- =====================================================================
-- MIGRACIÓN 001: sistema de pagos simulados
-- Para bases de datos que YA tienen el esquema anterior (sin precios ni pagos).
-- Las instalaciones nuevas no la necesitan: database/schema.sql ya lo incluye.
--
-- Es idempotente: se puede ejecutar más de una vez sin efectos secundarios.
--   cd backend && npm run db:migrate
--
-- IMPORTANTE (datos existentes):
--  * Las reservas que ya existen quedan con precio 0 (=> "Sin costo"). No se les cobra
--    retroactivamente; solo las reservas NUEVAS usan los precios del inventario.
--  * Los recursos reciben precios de EJEMPLO (mesa $5.00 / silla $1.00) la primera vez.
--    Ajústalos en la pantalla de Inventario.
-- =====================================================================

BEGIN;

-- ---------- Tipos ENUM ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_pago') THEN
    CREATE TYPE tipo_pago AS ENUM ('COBRO', 'REEMBOLSO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metodo_pago') THEN
    CREATE TYPE metodo_pago AS ENUM ('TARJETA', 'EFECTIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_transaccion') THEN
    CREATE TYPE estado_transaccion AS ENUM ('APROBADO', 'RECHAZADO');
  END IF;
END $$;

-- Nuevos tipos de movimiento del historial (el valor no se usa en esta misma transacción)
ALTER TYPE tipo_movimiento ADD VALUE IF NOT EXISTS 'PAGO';
ALTER TYPE tipo_movimiento ADD VALUE IF NOT EXISTS 'REEMBOLSO';

-- ---------- Precio por recurso ----------
-- Los precios de ejemplo solo se asignan cuando la columna se crea (no pisan cambios posteriores).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = current_schema() AND table_name = 'recursos' AND column_name = 'precio_unitario') THEN
    ALTER TABLE recursos
      ADD COLUMN precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0);
    UPDATE recursos SET precio_unitario = CASE tipo WHEN 'MESA' THEN 5.00 ELSE 1.00 END;
  END IF;
END $$;

-- ---------- Precio congelado en cada línea de reserva ----------
ALTER TABLE reserva_detalle
  ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0);

-- ---------- Tabla de pagos ----------
CREATE TABLE IF NOT EXISTS pagos (
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
  CONSTRAINT chk_pagos_reembolso_aprobado CHECK (tipo = 'COBRO' OR estado = 'APROBADO'),
  CONSTRAINT chk_pagos_tarjeta CHECK (metodo <> 'TARJETA' OR tarjeta_ultimos4 IS NOT NULL),
  CONSTRAINT chk_pagos_ultimos4 CHECK (tarjeta_ultimos4 IS NULL OR tarjeta_ultimos4 ~ '^[0-9]{4}$')
);
CREATE INDEX IF NOT EXISTS idx_pagos_reserva ON pagos(reserva_id);
CREATE INDEX IF NOT EXISTS idx_pagos_created ON pagos(created_at DESC);

-- Registros financieros de solo inserción
CREATE OR REPLACE FUNCTION fn_pagos_inmutables() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla pagos es de solo inserción (los registros financieros no se modifican)';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pagos_inmutables ON pagos;
CREATE TRIGGER trg_pagos_inmutables
  BEFORE UPDATE OR DELETE ON pagos
  FOR EACH ROW EXECUTE FUNCTION fn_pagos_inmutables();

COMMIT;

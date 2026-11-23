import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const DEFAULT_RTDB_URL = 'https://spatech-b3edf-default-rtdb.firebaseio.com';

export function getRtdbBaseUrl(): string {
  return (process.env.FIREBASE_RTDB_URL || DEFAULT_RTDB_URL).replace(/\/$/, '');
}

function sha256Hex(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

function maskPhone(phone: string): string {
  const clean = (phone || '').trim();
  if (clean.length <= 4) return clean;
  return `***${clean.slice(-4)}`;
}

let syncInFlight: Promise<void> | null = null;
let syncQueued = false;

export async function syncSnapshotToFirebaseRtdb(db: DatabaseSync): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_FIREBASE_SYNC === 'true') {
    return;
  }
  const baseUrl = getRtdbBaseUrl();
  if (!baseUrl) return;

  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      const negocios = db
        .prepare(
          'SELECT id, codigo, rubro, nombre, descripcion, lat, lng, zona, en_linea, activo, saldo, saldo_retenido, calificacion FROM negocios'
        )
        .all() as Array<Record<string, any>>;

      const unidades = db
        .prepare(
          `SELECT u.id, u.negocio_id, n.nombre AS negocio_nombre, u.conductor_nombre, u.placa, u.modelo, u.color,
                  u.tarifa_base_centavos, u.tarifa_km_centavos, u.calificacion, u.lat, u.lng, u.estado, u.certificada
           FROM unidades_conductores u
           JOIN negocios n ON n.id = u.negocio_id`
        )
        .all() as Array<Record<string, any>>;

      const servicios = db
        .prepare(
          `SELECT s.id, s.negocio_id, n.nombre AS negocio_nombre, n.zona, n.calificacion, s.categoria,
                  s.nombre, s.descripcion, s.precio_centavos, s.duracion_min, s.stock, s.disponible
           FROM servicios_catalogo s
           JOIN negocios n ON n.id = s.negocio_id`
        )
        .all() as Array<Record<string, any>>;

      const divisas = db
        .prepare(
          `SELECT a.id, a.negocio_id, n.nombre AS negocio_nombre, n.zona, a.moneda_origen, a.moneda_destino, a.tasa_compra, a.tasa_venta
           FROM agentes_cambio a
           JOIN negocios n ON n.id = a.negocio_id`
        )
        .all() as Array<Record<string, any>>;

      const seatRoutes = db
        .prepare(
          `SELECT s.id, s.negocio_id, n.nombre AS negocio_nombre, s.codigo_ruta, s.ruta, s.unidad, s.salida_at, s.precio_centavos, s.total_asientos
           FROM asientos_servicios s
           JOIN negocios n ON n.id = s.negocio_id`
        )
        .all() as Array<Record<string, any>>;

      const seatBookedStmt = db.prepare(
        "SELECT asiento_numero FROM reservas_citas WHERE asiento_servicio_id = ? AND estado != 'CANCELADO'"
      );

      const reglas = db
        .prepare('SELECT rubro, porcentaje_plataforma, porcentaje_referido FROM reglas_comision')
        .all() as Array<Record<string, any>>;

      const pedidos = db
        .prepare(
          `SELECT p.id, p.codigo, p.negocio_id, p.referido_negocio_id, p.categoria, p.item_nombre, p.transcripcion,
                  p.monto_centavos, p.metodo_pago, p.estado, p.cliente_nombre, p.cliente_telefono, p.origen_texto,
                  p.destino_texto, p.intentos_pin, p.pin_bloqueado, p.comision_plataforma_centavos,
                  p.comision_referido_centavos, p.comision_retenida_centavos, p.created_at,
                  n.nombre AS negocio_nombre, n.zona AS negocio_zona
           FROM pedidos_ordenes p
           JOIN negocios n ON n.id = p.negocio_id
           ORDER BY p.id DESC LIMIT 100`
        )
        .all() as Array<Record<string, any>>;

      const emergencias = db
        .prepare(
          'SELECT id, codigo, cliente_nombre, ubicacion_texto, lat, lng, mensaje, estado, atendida_por, created_at FROM alertas_emergencias ORDER BY id DESC LIMIT 50'
        )
        .all() as Array<Record<string, any>>;

      // Preserve existing RTDB business pin_hash if already seeded so client-side RTDB login stays valid
      let existingNegocios: Record<string, any> = {};
      try {
        const curRes = await fetch(`${baseUrl}/lachuspa/negocios.json`);
        if (curRes.ok) {
          existingNegocios = (await curRes.json()) || {};
        }
      } catch {
        existingNegocios = {};
      }

      const defaultDemoPins: Record<string, string> = {
        'NEG-TX-01': '2468',
        'NEG-TX-02': '1357',
        'NEG-TU-01': '3691',
        'NEG-TU-02': '4826',
        'NEG-RE-01': '5792',
        'NEG-RE-02': '6428',
        'NEG-FA-01': '7531',
        'NEG-FA-02': '8642',
        'NEG-HO-01': '9513',
        'NEG-CC-01': '7419',
      };

      const negociosMap: Record<string, any> = {};
      for (const n of negocios) {
        const prev = existingNegocios[n.codigo];
        const salt = prev?.pin_salt || `seed-${n.codigo}`;
        const pinHash =
          prev?.pin_hash ||
          sha256Hex(`${salt}:${defaultDemoPins[n.codigo] || crypto.randomInt(1000, 9999)}`);
        negociosMap[n.codigo] = {
          ...n,
          pin_salt: salt,
          pin_hash: pinHash,
        };
      }

      const unidadesMap: Record<string, any> = {};
      for (const u of unidades) unidadesMap[String(u.id)] = u;

      const serviciosMap: Record<string, any> = {};
      for (const s of servicios) serviciosMap[String(s.id)] = s;

      const divisasMap: Record<string, any> = {};
      for (const d of divisas) divisasMap[String(d.id)] = d;

      const butacasMap: Record<string, any> = {};
      for (const r of seatRoutes) {
        const booked = (seatBookedStmt.all(r.id) as Array<{ asiento_numero: number }>).map(
          (b) => b.asiento_numero
        );
        butacasMap[String(r.id)] = { ...r, asientos_ocupados: booked };
      }

      const reglasMap: Record<string, any> = {};
      for (const reg of reglas) reglasMap[String(reg.rubro)] = reg;

      const pedidosMap: Record<string, any> = {};
      for (const p of pedidos) {
        const { cliente_telefono, ...rest } = p;
        pedidosMap[String(p.codigo)] = {
          ...rest,
          cliente_telefono_masked: maskPhone(String(cliente_telefono || '')),
        };
      }

      const emergenciasMap: Record<string, any> = {};
      for (const e of emergencias) {
        emergenciasMap[String(e.codigo)] = e;
      }

      const payload = {
        meta: {
          seeded: true,
          source: 'server-sqlite',
          updated_at: new Date().toISOString(),
        },
        negocios: negociosMap,
        unidades: unidadesMap,
        servicios: serviciosMap,
        divisas: divisasMap,
        butacas: butacasMap,
        reglas: reglasMap,
        pedidos: pedidosMap,
        emergencias: emergenciasMap,
      };

      await fetch(`${baseUrl}/lachuspa.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-blocking sync: local SQLite remains authoritative even if remote RTDB is unreachable
    } finally {
      syncInFlight = null;
      if (syncQueued) {
        syncQueued = false;
        void syncSnapshotToFirebaseRtdb(db);
      }
    }
  })();

  return syncInFlight;
}

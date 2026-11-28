import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPin } from './security.ts';
import { ensureUniversalOficiosCatalog } from './oficiosCatalog.ts';
import type { Rubro } from './types.ts';

export function initDatabase(dbPath = path.resolve(process.cwd(), 'data', 'lachuspa.sqlite')): DatabaseSync {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_ip_intentos (
      ip TEXT PRIMARY KEY,
      intentos_fallidos INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta TEXT
    );

    CREATE TABLE IF NOT EXISTS negocios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      rubro TEXT NOT NULL CHECK(rubro IN ('TRANSPORTE','TURISMO','HOTEL','RESTAURANTE','FARMACIA','CASA_CAMBIO')),
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      zona TEXT NOT NULL DEFAULT 'Centro Histórico, Cusco',
      en_linea INTEGER NOT NULL DEFAULT 1,
      activo INTEGER NOT NULL DEFAULT 1,
      saldo INTEGER NOT NULL DEFAULT 0 CHECK(saldo >= 0),
      saldo_retenido INTEGER NOT NULL DEFAULT 0 CHECK(saldo_retenido >= 0 AND saldo_retenido <= saldo),
      calificacion REAL NOT NULL DEFAULT 4.9,
      horario_apertura TEXT NOT NULL DEFAULT '07:00',
      horario_cierre TEXT NOT NULL DEFAULT '22:30',
      abierto_24h INTEGER NOT NULL DEFAULT 0,
      metodos_pago_aceptados TEXT NOT NULL DEFAULT 'Yape,Plin,Efectivo,Tarjeta',
      auto_aceptar_pedidos INTEGER NOT NULL DEFAULT 0,
      alerta_voz_activa INTEGER NOT NULL DEFAULT 1,
      tarifa_minima_centavos INTEGER NOT NULL DEFAULT 600,
      radio_cobertura_km REAL NOT NULL DEFAULT 8.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seguridad_credenciales (
      negocio_id INTEGER PRIMARY KEY REFERENCES negocios(id) ON DELETE CASCADE,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      intentos_fallidos INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta TEXT
    );

    CREATE TABLE IF NOT EXISTS seguridad_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_tipo TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      accion TEXT NOT NULL,
      detalle TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reglas_comision (
      rubro TEXT PRIMARY KEY CHECK(rubro IN ('TRANSPORTE','TURISMO','HOTEL','RESTAURANTE','FARMACIA','CASA_CAMBIO')),
      porcentaje_plataforma INTEGER NOT NULL CHECK(porcentaje_plataforma BETWEEN 0 AND 50),
      porcentaje_referido INTEGER NOT NULL CHECK(porcentaje_referido BETWEEN 0 AND 50),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK(porcentaje_plataforma + porcentaje_referido <= 50)
    );

    CREATE TABLE IF NOT EXISTS servicios_catalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      categoria TEXT NOT NULL CHECK(categoria IN ('TRANSPORTE','TURISMO','HOTEL','RESTAURANTE','FARMACIA','CASA_CAMBIO')),
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      precio_centavos INTEGER NOT NULL CHECK(precio_centavos > 0),
      duracion_min INTEGER NOT NULL DEFAULT 30,
      stock INTEGER NOT NULL DEFAULT 20 CHECK(stock >= 0),
      disponible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS unidades_conductores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      conductor_nombre TEXT NOT NULL,
      placa TEXT UNIQUE NOT NULL,
      modelo TEXT NOT NULL,
      color TEXT NOT NULL,
      tarifa_base_centavos INTEGER NOT NULL CHECK(tarifa_base_centavos > 0),
      tarifa_km_centavos INTEGER NOT NULL CHECK(tarifa_km_centavos > 0),
      calificacion REAL NOT NULL DEFAULT 4.9,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      estado TEXT NOT NULL DEFAULT 'DISPONIBLE' CHECK(estado IN ('DISPONIBLE','OCUPADO','FUERA_SERVICIO')),
      certificada INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pedidos_ordenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id),
      referido_negocio_id INTEGER REFERENCES negocios(id),
      promotor_codigo TEXT,
      categoria TEXT NOT NULL CHECK(categoria IN ('TRANSPORTE','TURISMO','HOTEL','RESTAURANTE','FARMACIA','CASA_CAMBIO')),
      servicio_id INTEGER REFERENCES servicios_catalogo(id),
      unidad_id INTEGER REFERENCES unidades_conductores(id),
      item_nombre TEXT NOT NULL,
      transcripcion TEXT NOT NULL DEFAULT '',
      monto_centavos INTEGER NOT NULL CHECK(monto_centavos > 0),
      metodo_pago TEXT NOT NULL CHECK(metodo_pago IN ('Yape','Plin','Efectivo','Tarjeta')),
      estado TEXT NOT NULL CHECK(estado IN ('PENDIENTE_CONFIRMACION','CONFIRMADO_PREPARACION','ENTREGADO_PAGADO','CANCELADO')),
      cliente_nombre TEXT NOT NULL,
      cliente_telefono TEXT NOT NULL,
      origen_texto TEXT,
      destino_texto TEXT,
      origen_lat REAL,
      origen_lng REAL,
      distancia_km REAL,
      eta_min INTEGER,
      fecha_hora_reserva TEXT,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      pin_cifrado TEXT,
      intentos_pin INTEGER NOT NULL DEFAULT 0,
      pin_bloqueado INTEGER NOT NULL DEFAULT 0,
      comision_plataforma_centavos INTEGER NOT NULL DEFAULT 0,
      comision_referido_centavos INTEGER NOT NULL DEFAULT 0,
      comision_retenida_centavos INTEGER NOT NULL DEFAULT 0,
      contraoferta_centavos INTEGER,
      motivo_cancelacion TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ledger_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cuenta_tipo TEXT NOT NULL CHECK(cuenta_tipo IN ('NEGOCIO','PLATAFORMA')),
      negocio_id INTEGER REFERENCES negocios(id),
      tipo TEXT NOT NULL CHECK(tipo IN ('RECARGA','AJUSTE','RETENCION','LIBERACION','COMISION','CREDITO_REFERIDO','INGRESO_PLATAFORMA')),
      monto_centavos INTEGER NOT NULL,
      retenido_delta_centavos INTEGER NOT NULL DEFAULT 0,
      saldo_posterior_centavos INTEGER NOT NULL,
      retenido_posterior_centavos INTEGER NOT NULL,
      referencia TEXT NOT NULL,
      motivo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS trg_ledger_no_update
    BEFORE UPDATE ON ledger_movimientos
    BEGIN
      SELECT RAISE(ABORT, 'ledger_movimientos es inmutable: UPDATE prohibido');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_ledger_no_delete
    BEFORE DELETE ON ledger_movimientos
    BEGIN
      SELECT RAISE(ABORT, 'ledger_movimientos es inmutable: DELETE prohibido');
    END;

    CREATE TABLE IF NOT EXISTS negocios_recargas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id),
      monto_centavos INTEGER NOT NULL CHECK(monto_centavos > 0 AND monto_centavos <= 500000),
      metodo TEXT NOT NULL CHECK(metodo IN ('Yape','Plin','Transferencia')),
      codigo_operacion TEXT UNIQUE NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','APROBADO','RECHAZADO')),
      motivo_rechazo TEXT,
      revisado_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agentes_cambio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      moneda_origen TEXT NOT NULL,
      moneda_destino TEXT NOT NULL,
      tasa_compra REAL NOT NULL CHECK(tasa_compra > 0),
      tasa_venta REAL NOT NULL CHECK(tasa_venta > 0),
      disponible INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(negocio_id, moneda_origen, moneda_destino)
    );

    CREATE TABLE IF NOT EXISTS bloqueos_tasas_divisas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id),
      codigo_retiro TEXT UNIQUE NOT NULL,
      cliente_nombre TEXT NOT NULL,
      cliente_telefono TEXT NOT NULL,
      moneda TEXT NOT NULL,
      operacion TEXT NOT NULL CHECK(operacion IN ('COMPRA','VENTA')),
      monto_origen REAL NOT NULL CHECK(monto_origen > 0),
      tasa_aplicada REAL NOT NULL CHECK(tasa_aplicada > 0),
      monto_destino REAL NOT NULL CHECK(monto_destino > 0),
      estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK(estado IN ('ACTIVO','COBRADO','EXPIRADO')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS asientos_servicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      codigo_ruta TEXT UNIQUE NOT NULL,
      ruta TEXT NOT NULL,
      unidad TEXT NOT NULL,
      salida_at TEXT NOT NULL,
      precio_centavos INTEGER NOT NULL CHECK(precio_centavos > 0),
      total_asientos INTEGER NOT NULL DEFAULT 16
    );

    CREATE TABLE IF NOT EXISTS reservas_citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asiento_servicio_id INTEGER NOT NULL REFERENCES asientos_servicios(id) ON DELETE CASCADE,
      asiento_numero INTEGER NOT NULL CHECK(asiento_numero >= 1),
      cliente_nombre TEXT NOT NULL,
      cliente_telefono TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'RESERVADO' CHECK(estado IN ('RESERVADO','ABORDO','CANCELADO')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(asiento_servicio_id, asiento_numero)
    );

    CREATE TABLE IF NOT EXISTS alertas_emergencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      cliente_nombre TEXT NOT NULL,
      cliente_telefono TEXT NOT NULL,
      ubicacion_texto TEXT NOT NULL,
      lat REAL,
      lng REAL,
      mensaje TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'ACTIVA' CHECK(estado IN ('ACTIVA','ATENDIDA')),
      atendida_por TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partners_afiliados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      porcentaje_comision INTEGER NOT NULL CHECK(porcentaje_comision BETWEEN 1 AND 25),
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_comisiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners_afiliados(id),
      pedido_id INTEGER NOT NULL REFERENCES pedidos_ordenes(id),
      monto_centavos INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resenas_valoraciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER UNIQUE NOT NULL REFERENCES pedidos_ordenes(id),
      negocio_id INTEGER NOT NULL REFERENCES negocios(id),
      cliente_nombre TEXT NOT NULL,
      calificacion INTEGER NOT NULL CHECK(calificacion BETWEEN 1 AND 5),
      comentario TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usuarios_clientes (
      telefono TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      puntos INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS historial_puntos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT NOT NULL REFERENCES usuarios_clientes(telefono),
      pedido_codigo TEXT NOT NULL,
      puntos INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS log_procesos_notificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canal TEXT NOT NULL,
      destinatario TEXT NOT NULL,
      plantilla TEXT NOT NULL,
      pedido_codigo TEXT,
      mensaje TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'ENVIADO',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documentos_peru (
      numero TEXT PRIMARY KEY,
      tipo TEXT NOT NULL CHECK(tipo IN ('DNI','RUC')),
      nombre_completo TEXT NOT NULL,
      razon_social TEXT,
      estado TEXT,
      condicion TEXT,
      direccion TEXT,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dev_api_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      proveedor_consultas TEXT NOT NULL DEFAULT 'auto' CHECK(proveedor_consultas IN ('auto','apisperu','apisnetpe')),
      token_consultas TEXT NOT NULL DEFAULT '',
      token_facturacion TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oficios_catalogo (
      oficio_id TEXT PRIMARY KEY,
      nombre_oficial TEXT NOT NULL,
      macro_categoria TEXT NOT NULL,
      rubro_base TEXT NOT NULL DEFAULT 'RESTAURANTE',
      sinonimos_json TEXT NOT NULL DEFAULT '[]',
      modalidades_json TEXT NOT NULL DEFAULT '[]',
      tipo_tarifa_sugerida TEXT NOT NULL DEFAULT 'por_servicio_fijo',
      atributos_clave_json TEXT NOT NULL DEFAULT '[]',
      etiquetas_busqueda_json TEXT NOT NULL DEFAULT '[]',
      generado_por TEXT NOT NULL DEFAULT 'semilla_universal',
      uso_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cuentas_usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wechat_id TEXT UNIQUE NOT NULL,
      documento_tipo TEXT NOT NULL CHECK(documento_tipo IN ('DNI','RUC','EXTRANJERO')),
      documento_numero TEXT NOT NULL,
      nombre TEXT NOT NULL,
      direccion_fiscal TEXT,
      pais_codigo TEXT NOT NULL DEFAULT '+51',
      pais_nombre TEXT NOT NULL DEFAULT 'Perú',
      whatsapp TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      whatsapp_verificado INTEGER NOT NULL DEFAULT 0,
      otp_hash TEXT,
      otp_salt TEXT,
      otp_expires_at TEXT,
      otp_intentos INTEGER NOT NULL DEFAULT 0,
      idioma TEXT NOT NULL DEFAULT 'Español',
      estado_texto TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      notificaciones_activas INTEGER NOT NULL DEFAULT 1,
      mostrar_siempre_arriba INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(documento_tipo, documento_numero)
    );

    CREATE TABLE IF NOT EXISTS usuario_chats_mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES cuentas_usuarios(id),
      conversacion_id TEXT NOT NULL,
      remitente TEXT NOT NULL CHECK(remitente IN ('USER','AGENT','SYSTEM','CONTACT')),
      tipo_contenido TEXT NOT NULL DEFAULT 'TEXTO',
      texto TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migración idempotente para bases SQLite existentes
  const ensureCols = (table: string, defs: Array<[string, string]>) => {
    const existing = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    for (const [col, def] of defs) {
      if (!existing.includes(col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
      }
    }
  };

  ensureCols('negocios', [
    ['horario_apertura', "TEXT NOT NULL DEFAULT '07:00'"],
    ['horario_cierre', "TEXT NOT NULL DEFAULT '22:30'"],
    ['abierto_24h', 'INTEGER NOT NULL DEFAULT 0'],
    ['metodos_pago_aceptados', "TEXT NOT NULL DEFAULT 'Yape,Plin,Efectivo,Tarjeta'"],
    ['auto_aceptar_pedidos', 'INTEGER NOT NULL DEFAULT 0'],
    ['alerta_voz_activa', 'INTEGER NOT NULL DEFAULT 1'],
    ['tarifa_minima_centavos', 'INTEGER NOT NULL DEFAULT 600'],
    ['radio_cobertura_km', 'REAL NOT NULL DEFAULT 8.0'],
    ['tipo_persona', "TEXT NOT NULL DEFAULT 'JURIDICA'"],
    ['documento_tipo', "TEXT NOT NULL DEFAULT 'RUC'"],
    ['documento_numero', 'TEXT'],
    ['razon_social', 'TEXT'],
    ['tipo_negocio', "TEXT NOT NULL DEFAULT 'Comercio Multirubro'"],
    ['macro_categoria', "TEXT NOT NULL DEFAULT 'Comercio, Abastecimiento y Ferretería'"],
    ['oficio_especifico', "TEXT NOT NULL DEFAULT 'Comercio Multirubro'"],
    ['oficio_id', 'TEXT'],
    ['modalidades_venta', "TEXT NOT NULL DEFAULT 'UNIDAD,SERVICIO'"],
    ['panel_ia_json', 'TEXT'],
    ['estado_regla', "TEXT NOT NULL DEFAULT 'ACTIVO'"],
    ['motivo_estado', 'TEXT'],
    ['mp_public_key', 'TEXT'],
    ['mp_access_token', 'TEXT'],
    ['yape_numero', 'TEXT'],
    ['plin_numero', 'TEXT'],
    ['banco_nombre', 'TEXT'],
    ['banco_titular', 'TEXT'],
    ['banco_cuenta', 'TEXT'],
    ['banco_cci', 'TEXT'],
  ]);

  ensureCols('servicios_catalogo', [
    ['unidad_medida', "TEXT NOT NULL DEFAULT 'UNIDAD'"],
    ['atributos_json', 'TEXT'],
  ]);

  ensureCols('pedidos_ordenes', [
    ['cliente_documento_tipo', 'TEXT'],
    ['cliente_documento_numero', 'TEXT'],
    ['cliente_documento_verificado', 'INTEGER NOT NULL DEFAULT 0'],
    ['cliente_direccion_fiscal', 'TEXT'],
    ['comprobante_tipo', 'TEXT'],
    ['comprobante_serie', 'TEXT'],
    ['comprobante_numero', 'TEXT'],
    ['comprobante_emitido_at', 'TEXT'],
    ['comprobante_hash', 'TEXT'],
    ['comprobante_sunat_estado', 'TEXT'],
    ['destino_lat', 'REAL'],
    ['destino_lng', 'REAL'],
    ['conductor_lat', 'REAL'],
    ['conductor_lng', 'REAL'],
    ['pin_validado', 'INTEGER NOT NULL DEFAULT 0'],
    ['pin_validado_at', 'TEXT'],
    ['viaje_etapa', 'TEXT'],
    ['pago_gateway', 'TEXT'],
    ['pago_referencia', 'TEXT'],
    ['pago_estado', 'TEXT'],
  ]);

  ensureCols('alertas_emergencias', [
    ['entidad_objetivo', "TEXT NOT NULL DEFAULT 'SAMU'"],
    ['solicitante_documento_tipo', 'TEXT'],
    ['solicitante_documento_numero', 'TEXT'],
    ['solicitante_nombre', 'TEXT'],
    ['herido_nombre', 'TEXT'],
    ['unidad_lat', 'REAL'],
    ['unidad_lng', 'REAL'],
    ['distancia_km', 'REAL'],
    ['eta_min', 'INTEGER'],
    ['sincronizada_todas', 'INTEGER NOT NULL DEFAULT 1'],
  ]);

  db.exec(`
    UPDATE negocios
    SET abierto_24h = 1, horario_apertura = '00:00', horario_cierre = '23:59'
    WHERE codigo IN ('NEG-FA-01', 'NEG-HO-01') AND abierto_24h = 0 AND horario_apertura = '07:00';
  `);

  ensureUniversalOficiosCatalog(db);

  return db;
}

export function seedDatabase(db: DatabaseSync): void {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM negocios').get() as { count: number };
  if (existing.count > 0) return;

  // Reglas iniciales de comisión según sección 3.7: 3% plataforma, 0% referido
  const insertRegla = db.prepare(
    'INSERT INTO reglas_comision (rubro, porcentaje_plataforma, porcentaje_referido) VALUES (?, ?, ?)'
  );
  const rubros: Rubro[] = ['TRANSPORTE', 'TURISMO', 'HOTEL', 'RESTAURANTE', 'FARMACIA', 'CASA_CAMBIO'];
  for (const r of rubros) {
    insertRegla.run(r, 3, 0);
  }

  const insertNegocio = db.prepare(`
    INSERT INTO negocios (codigo, rubro, nombre, telefono, descripcion, lat, lng, zona, en_linea, activo, saldo, saldo_retenido, calificacion, horario_apertura, horario_cierre, abierto_24h, tipo_negocio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 0, ?, ?, ?, ?, ?)
  `);
  const insertCred = db.prepare(
    'INSERT INTO seguridad_credenciales (negocio_id, pin_hash, pin_salt) VALUES (?, ?, ?)'
  );
  const insertLedger = db.prepare(`
    INSERT INTO ledger_movimientos (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
    VALUES ('NEGOCIO', ?, 'RECARGA', ?, 0, ?, 0, ?, 'Saldo inicial verificado')
  `);

  const seedBusinesses: Array<{
    codigo: string;
    rubro: Rubro;
    tipo_negocio: string;
    nombre: string;
    telefono: string;
    descripcion: string;
    lat: number;
    lng: number;
    zona: string;
    saldo: number;
    calificacion: number;
    demoPin: string;
  }> = [
    {
      codigo: 'NEG-TX-01',
      rubro: 'TRANSPORTE',
      tipo_negocio: 'Taxi / Movilidad',
      nombre: 'Inka Executive Mobility',
      telefono: '+51984110201',
      descripcion: 'Flota privada certificada con traslados ejecutivos aeropuerto, centro y Valle Sagrado.',
      lat: -13.5167,
      lng: -71.9788,
      zona: 'Plaza de Armas, Cusco',
      saldo: 18000,
      calificacion: 4.95,
      demoPin: '2468',
    },
    {
      codigo: 'NEG-TX-02',
      rubro: 'TRANSPORTE',
      tipo_negocio: 'Taxi / Movilidad',
      nombre: 'Qorikancha Private Cars',
      telefono: '+51984110202',
      descripcion: 'Sedanes ejecutivos y SUVs híbridas de recojo inmediato en Cusco.',
      lat: -13.5204,
      lng: -71.9752,
      zona: 'Av. El Sol, Cusco',
      saldo: 0,
      calificacion: 4.82,
      demoPin: '1357',
    },
    {
      codigo: 'NEG-TU-01',
      rubro: 'TURISMO',
      tipo_negocio: 'Turismo & Guías',
      nombre: 'Apu Salkantay Atelier',
      telefono: '+51984220301',
      descripcion: 'Guías oficiales bilingües y experiencias privadas en Machu Picchu, Maras y Moray.',
      lat: -13.5142,
      lng: -71.9815,
      zona: 'San Blas, Cusco',
      saldo: 32000,
      calificacion: 4.98,
      demoPin: '3691',
    },
    {
      codigo: 'NEG-TU-02',
      rubro: 'TURISMO',
      tipo_negocio: 'Turismo & Guías',
      nombre: 'Andes Heritage Concierge',
      telefono: '+51984220302',
      descripcion: 'Excursiones curadas al Valle Sagrado y Vinicunca con guía privado.',
      lat: -13.5189,
      lng: -71.9765,
      zona: 'Calle Palacio, Cusco',
      saldo: 25000,
      calificacion: 4.91,
      demoPin: '4826',
    },
    {
      codigo: 'NEG-RE-01',
      rubro: 'RESTAURANTE',
      tipo_negocio: 'Restaurante / Gastronomía',
      nombre: 'Cicciolina & Brasa Andina',
      telefono: '+51984330401',
      descripcion: 'Alta cocina cusqueña contemporánea, tapas andinas y cava privada.',
      lat: -13.5153,
      lng: -71.9768,
      zona: 'Calle Triunfo, Cusco',
      saldo: 24000,
      calificacion: 4.96,
      demoPin: '5792',
    },
    {
      codigo: 'NEG-RE-02',
      rubro: 'RESTAURANTE',
      tipo_negocio: 'Restaurante / Gastronomía',
      nombre: 'Chicha Gourmet Express',
      telefono: '+51984330402',
      descripcion: 'Platos emblemáticos cusqueños con despacho térmico de lujo.',
      lat: -13.5178,
      lng: -71.9799,
      zona: 'Plaza Regocijo, Cusco',
      saldo: 15000,
      calificacion: 4.88,
      demoPin: '6428',
    },
    {
      codigo: 'NEG-FA-01',
      rubro: 'FARMACIA',
      tipo_negocio: 'Botica / Farmacia',
      nombre: 'Botica Imperial San Blas',
      telefono: '+51984440501',
      descripcion: 'Farmacia 24h especializada en mal de altura (soroche), oxígeno portátil y dermocosmética.',
      lat: -13.5149,
      lng: -71.9742,
      zona: 'Cuesta San Blas, Cusco',
      saldo: 14000,
      calificacion: 4.94,
      demoPin: '7531',
    },
    {
      codigo: 'NEG-FA-02',
      rubro: 'FARMACIA',
      tipo_negocio: 'Botica / Farmacia',
      nombre: 'Apotecaria Plaza Mayor',
      telefono: '+51984440502',
      descripcion: 'Atención farmacéutica bilingüe y entrega directa en hoteles boutique.',
      lat: -13.5171,
      lng: -71.9781,
      zona: 'Portal de Panes, Cusco',
      saldo: 11000,
      calificacion: 4.89,
      demoPin: '8642',
    },
    {
      codigo: 'NEG-HO-01',
      rubro: 'HOTEL',
      tipo_negocio: 'Hotel / Alojamiento',
      nombre: 'Palacio Nazarenas Suites',
      telefono: '+51984550601',
      descripcion: 'Suites claustro oxigenadas en casona colonial del siglo XVI con mayordomo.',
      lat: -13.5147,
      lng: -71.9776,
      zona: 'Plaza Nazarenas, Cusco',
      saldo: 45000,
      calificacion: 4.99,
      demoPin: '9513',
    },
    {
      codigo: 'NEG-CC-01',
      rubro: 'CASA_CAMBIO',
      tipo_negocio: 'Casa de Cambio',
      nombre: 'Casa de Cambio Inti Gold',
      telefono: '+51984660701',
      descripcion: 'Cambio preferencial USD/EUR/BRL a Soles con reserva de tasa y recojo blindado.',
      lat: -13.5192,
      lng: -71.9748,
      zona: 'Av. El Sol 380, Cusco',
      saldo: 20000,
      calificacion: 4.93,
      demoPin: '7419',
    },
  ];

  const negocioIds: Record<string, number> = {};
  for (const b of seedBusinesses) {
    const is24h = b.codigo === 'NEG-FA-01' || b.codigo === 'NEG-HO-01';
    const res = insertNegocio.run(
      b.codigo,
      b.rubro,
      b.nombre,
      b.telefono,
      b.descripcion,
      b.lat,
      b.lng,
      b.zona,
      b.saldo,
      b.calificacion,
      is24h ? '00:00' : '07:00',
      is24h ? '23:59' : '22:30',
      is24h ? 1 : 0,
      b.tipo_negocio
    );
    const id = Number(res.lastInsertRowid);
    negocioIds[b.codigo] = id;
    const { hash, salt } = hashPin(b.demoPin);
    insertCred.run(id, hash, salt);
    if (b.saldo > 0) {
      insertLedger.run(id, b.saldo, b.saldo, `SEED-INIT-${b.codigo}`);
    }
  }

  // Unidades de transporte
  const insertUnit = db.prepare(`
    INSERT INTO unidades_conductores
    (negocio_id, conductor_nombre, placa, modelo, color, tarifa_base_centavos, tarifa_km_centavos, calificacion, lat, lng, estado, certificada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPONIBLE', ?)
  `);
  insertUnit.run(negocioIds['NEG-TX-01'], 'Mateo Quispe Huamán', 'X4A-912', 'Lexus NX 350h', 'Obsidiana', 1500, 450, 4.97, -13.5162, -71.9781, 1);
  insertUnit.run(negocioIds['NEG-TX-01'], 'Lucía Condori Mamani', 'X5B-304', 'Volvo XC40 Recharge', 'Plata Glaciar', 1400, 420, 4.94, -13.5198, -71.9741, 1);
  insertUnit.run(negocioIds['NEG-TX-02'], 'Carlos Tupayachi', 'X2C-778', 'Toyota Camry Hybrid', 'Negro Noche', 1200, 380, 4.85, -13.5210, -71.9755, 1);

  // Catálogo por negocio y categoría estricta
  const insertItem = db.prepare(`
    INSERT INTO servicios_catalogo (negocio_id, categoria, nombre, descripcion, precio_centavos, duracion_min, stock, disponible)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  // Turismo
  insertItem.run(negocioIds['NEG-TU-01'], 'TURISMO', 'Guía Privado Machu Picchu + Tren Vistadome', 'Tour curado con guía arqueólogo bilingüe y traslados puerta a puerta.', 95000, 720, 12);
  insertItem.run(negocioIds['NEG-TU-01'], 'TURISMO', 'Expedición Privada Valle Sagrado, Maras y Moray', 'Recorrido VIP por Pisac, salineras de Maras y andenes de Moray.', 38000, 480, 15);
  insertItem.run(negocioIds['NEG-TU-02'], 'TURISMO', 'City Tour Arqueológico Privado Sacsayhuamán', 'Circuito privado de medio día con guía historiador y acceso preferente.', 24000, 240, 20);
  // Restaurante
  insertItem.run(negocioIds['NEG-RE-01'], 'RESTAURANTE', 'Degustación Trucha del Valle y Lomo Saltado Wagyu', 'Dos tiempos de alta cocina cusqueña con empaque térmico artesanal.', 14500, 35, 30);
  insertItem.run(negocioIds['NEG-RE-01'], 'RESTAURANTE', 'Ceviche Clásico de Lenguado & Pisco Sour Reserva', 'Fresco al instante con ají limo y maíz chulpi crocante.', 9800, 25, 25);
  insertItem.run(negocioIds['NEG-RE-02'], 'RESTAURANTE', 'Ceviche Andino de Trucha & Quinoto', 'Preparación tradicional cusqueña con delivery prioritario.', 7600, 25, 40);
  // Farmacia
  insertItem.run(negocioIds['NEG-FA-01'], 'FARMACIA', 'Kit Soroche Imperial (Oxígeno 15L + Acetazolamida)', 'Alivio inmediato para el mal de altura con entrega en 15 minutos.', 8500, 15, 25);
  insertItem.run(negocioIds['NEG-FA-01'], 'FARMACIA', 'Infusión Concentrada de Muña + Electrolitos Suizos', 'Hidratación de altura y alivio digestivo inmediato.', 4200, 15, 50);
  insertItem.run(negocioIds['NEG-FA-02'], 'FARMACIA', 'Kit Soroche Esencial + Analgésico Express', 'Atención farmacéutica bilingüe directo a tu hotel.', 6900, 18, 35);
  // Hotel
  insertItem.run(negocioIds['NEG-HO-01'], 'HOTEL', 'Suite Claustro Oxigenada (Noche VIP)', 'Habitación patrimonial enriquecida con oxígeno y desayuno andino.', 89000, 60, 6);
  insertItem.run(negocioIds['NEG-HO-01'], 'HOTEL', 'Day-Use Spa Andino & Oxigenoterapia (4h)', 'Acceso privado a piscina climatizada y recuperación de altura.', 34000, 240, 8);

  // Tasas de cambio
  const insertRate = db.prepare(`
    INSERT INTO agentes_cambio (negocio_id, moneda_origen, moneda_destino, tasa_compra, tasa_venta, disponible)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  insertRate.run(negocioIds['NEG-CC-01'], 'USD', 'PEN', 3.745, 3.775);
  insertRate.run(negocioIds['NEG-CC-01'], 'EUR', 'PEN', 4.020, 4.090);

  // Rutas interprovinciales de butacas
  const insertSeatRoute = db.prepare(`
    INSERT INTO asientos_servicios (negocio_id, codigo_ruta, ruta, unidad, salida_at, precio_centavos, total_asientos)
    VALUES (?, ?, ?, ?, ?, ?, 16)
  `);
  const seatRoute1 = insertSeatRoute.run(
    negocioIds['NEG-TX-01'],
    'RSV-CUSCO-101',
    'Cusco → Ollantaytambo (Sprinter Lounge)',
    'Mercedes Sprinter VIP · 160° Reclinable',
    'Hoy · 16:30',
    6500
  );
  insertSeatRoute.run(
    negocioIds['NEG-TX-01'],
    'RSV-CUSCO-204',
    'Cusco → Aeropuerto / Valle Sagrado (Urubamba)',
    'Mercedes Sprinter Executive',
    'Mañana · 08:00',
    7500
  );
  // Pre-reservar asientos 2 y 3 en RSV-CUSCO-101 para demostrar control de choques
  const { hash: seatPinH, salt: seatPinS } = hashPin('7391');
  const insertSeatRes = db.prepare(`
    INSERT INTO reservas_citas (asiento_servicio_id, asiento_numero, cliente_nombre, cliente_telefono, pin_hash, pin_salt, estado)
    VALUES (?, ?, ?, ?, ?, ?, 'RESERVADO')
  `);
  insertSeatRes.run(Number(seatRoute1.lastInsertRowid), 2, 'Elena Rostova', '+51999001122', seatPinH, seatPinS);
  insertSeatRes.run(Number(seatRoute1.lastInsertRowid), 3, 'Julián Thorne', '+51999001123', seatPinH, seatPinS);

  // Promotores / Partners
  const insertPartner = db.prepare(`
    INSERT INTO partners_afiliados (codigo, nombre, telefono, porcentaje_comision, activo)
    VALUES (?, ?, ?, ?, 1)
  `);
  insertPartner.run('CUSCOVIP', 'Valeria Mendoza · Concierge Hotelero', '+51984770100', 10);
  insertPartner.run('INKALUX', 'Diego Salcedo · Embajador Valle Sagrado', '+51984770101', 8);
}

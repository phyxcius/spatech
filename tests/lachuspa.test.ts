import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../backend/app.ts';
import { initDatabase, seedDatabase } from '../backend/db.ts';
import { auditarLibroContable, expireStaleOrders } from '../backend/finance.ts';
import { hashPin, validateProductionEnv } from '../backend/security.ts';

async function startTestServer() {
  process.env.DISABLE_FIREBASE_SYNC = 'true';
  process.env.JWT_SECRET = 'la_chuspa_test_secret_key_with_more_than_32_characters_ok';
  process.env.SUPERADMIN_PIN = '998877';
  process.env.WHATSAPP_VERIFY_TOKEN = 'cusco_wa_verify_token';

  const db = initDatabase(':memory:');
  seedDatabase(db);
  const app = createApp({ db, skipRateLimit: true });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function req(
    method: string,
    path: string,
    body?: unknown,
    token?: string
  ): Promise<{ status: number; data: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  }

  return { db, server, req };
}

test('1. Autenticación RBAC: 401 sin sesión, 403 con otro negocio o rol cruzado', async () => {
  const { server, req } = await startTestServer();
  try {
    const noAuth = await req('GET', '/api/negocio/1/resumen');
    assert.equal(noAuth.status, 401);

    const noAdmin = await req('GET', '/api/admin/panel');
    assert.equal(noAdmin.status, 401);

    // Login taxi #1 (NEG-TX-01, PIN 2468)
    const loginTx1 = await req('POST', '/api/negocio/login', { codigo: 'NEG-TX-01', pin: '2468' });
    assert.equal(loginTx1.status, 200);
    const tx1Token = loginTx1.data.token;

    // Negocio 1 intenta leer Negocio 3 -> 403
    const crossBiz = await req('GET', '/api/negocio/3/resumen', undefined, tx1Token);
    assert.equal(crossBiz.status, 403);

    // Negocio 1 intenta ruta de admin -> 403
    const bizToAdmin = await req('GET', '/api/admin/panel', undefined, tx1Token);
    assert.equal(bizToAdmin.status, 403);

    // Login admin
    const loginAdmin = await req('POST', '/api/admin/login', { pin: '998877' });
    assert.equal(loginAdmin.status, 200);
    const adminToken = loginAdmin.data.token;

    // Admin intenta ruta de negocio -> 403
    const adminToBiz = await req('GET', '/api/negocio/1/resumen', undefined, adminToken);
    assert.equal(adminToBiz.status, 403);
  } finally {
    server.close();
  }
});

test('2. Recargas: queda pendiente, no altera saldo, código único, solo admin aprueba una vez', async () => {
  const { db, server, req } = await startTestServer();
  try {
    const loginTx2 = await req('POST', '/api/negocio/login', { codigo: 'NEG-TX-02', pin: '1357' });
    assert.equal(loginTx2.status, 200);
    const tx2Id = loginTx2.data.negocio.id;
    const tx2Token = loginTx2.data.token;
    assert.equal(loginTx2.data.negocio.saldo, 0);

    // Solicitar recarga de S/ 50.00
    const rec = await req(
      'POST',
      `/api/negocio/${tx2Id}/recargas`,
      { monto_centavos: 5000, metodo: 'Yape', codigo_operacion: 'YAPE-991122' },
      tx2Token
    );
    assert.equal(rec.status, 201);
    assert.equal(rec.data.recarga.estado, 'PENDIENTE');

    // Saldo sigue en 0 mientras está pendiente
    const resumenPend = await req('GET', `/api/negocio/${tx2Id}/resumen`, undefined, tx2Token);
    assert.equal(resumenPend.data.negocio.saldo, 0);

    // Mismo código de operación no se registra dos veces
    const dup = await req(
      'POST',
      `/api/negocio/${tx2Id}/recargas`,
      { monto_centavos: 5000, metodo: 'Yape', codigo_operacion: 'YAPE-991122' },
      tx2Token
    );
    assert.equal(dup.status, 409);

    // Login admin y aprobar recarga
    const loginAdmin = await req('POST', '/api/admin/login', { pin: '998877' });
    const adminToken = loginAdmin.data.token;
    const recId = rec.data.recarga.id;

    const aprobar1 = await req('POST', `/api/admin/recargas/${recId}/aprobar`, {}, adminToken);
    assert.equal(aprobar1.status, 200);
    assert.equal(aprobar1.data.saldo, 5000);

    // No se puede aprobar de nuevo
    const aprobar2 = await req('POST', `/api/admin/recargas/${recId}/aprobar`, {}, adminToken);
    assert.equal(aprobar2.status, 409);

    const audit = auditarLibroContable(db);
    assert.equal(audit.cuadra, true);
  } finally {
    server.close();
  }
});

test('3. Saldo insuficiente (402), retención al aceptar, cobro al validar PIN y liberación al cancelar', async () => {
  const { db, server, req } = await startTestServer();
  try {
    // Unidad #3 pertenece a NEG-TX-02 (saldo = 0)
    const dir = await req('GET', '/api/public/directorio');
    const unitTx2 = dir.data.unidades.find((u: any) => u.placa === 'X2C-778');
    assert.ok(unitTx2);

    // Crear pedido de taxi (precio calculado en servidor, ignorando cualquier precio enviado)
    const taxiOrder = await req('POST', '/api/public/taxi/pedir', {
      unidad_id: unitTx2.id,
      metodo_pago: 'Efectivo',
      cliente_nombre: 'Sofía Vargas',
      cliente_telefono: '+51984998877',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
      destino_texto: 'Aeropuerto Velasco Astete',
      precio_centavos: 1, // Intento de manipulación ignorado por servidor
    });
    assert.equal(taxiOrder.status, 201);
    assert.ok(taxiOrder.data.pedido.monto_centavos >= 1200);
    const pinCliente = taxiOrder.data.cliente_pin;
    assert.match(pinCliente, /^\d{4}$/);

    const loginTx2 = await req('POST', '/api/negocio/login', { codigo: 'NEG-TX-02', pin: '1357' });
    const tx2Id = loginTx2.data.negocio.id;
    const tx2Token = loginTx2.data.token;

    // Sin saldo -> 402 y pedido sigue pendiente
    const acceptFail = await req(
      'POST',
      `/api/negocio/${tx2Id}/pedidos/${taxiOrder.data.pedido.id}/aceptar`,
      {},
      tx2Token
    );
    assert.equal(acceptFail.status, 402);

    const checkPend = await req('GET', `/api/public/pedidos/${taxiOrder.data.pedido.codigo}`);
    assert.equal(checkPend.data.pedido.estado, 'PENDIENTE_CONFIRMACION');
    assert.equal(checkPend.data.pedido.pin_hash, undefined);
    assert.equal(checkPend.data.pedido.cliente_pin, undefined);

    // El negocio recarga saldo via admin
    const loginAdmin = await req('POST', '/api/admin/login', { pin: '998877' });
    const adminToken = loginAdmin.data.token;
    await req(
      'POST',
      '/api/admin/ajustes-saldo',
      { negocio_id: tx2Id, delta_centavos: 10000, motivo: 'Crédito de prueba' },
      adminToken
    );

    // Ahora acepta -> retiene comisión (3%)
    const acceptOk = await req(
      'POST',
      `/api/negocio/${tx2Id}/pedidos/${taxiOrder.data.pedido.id}/aceptar`,
      {},
      tx2Token
    );
    assert.equal(acceptOk.status, 200);
    assert.equal(acceptOk.data.pedido.estado, 'CONFIRMADO_PREPARACION');
    const retencion = acceptOk.data.pedido.comision_retenida_centavos;
    assert.ok(retencion > 0);

    // Aceptar dos veces -> 409, no retiene dos veces
    const acceptDup = await req(
      'POST',
      `/api/negocio/${tx2Id}/pedidos/${taxiOrder.data.pedido.id}/aceptar`,
      {},
      tx2Token
    );
    assert.equal(acceptDup.status, 409);

    // Cancelar pedido aceptado -> libera retención
    const cancel1 = await req(
      'POST',
      `/api/public/pedidos/${taxiOrder.data.pedido.codigo}/cancelar`,
      { cliente_telefono: '+51984998877' }
    );
    assert.equal(cancel1.status, 200);
    assert.equal(cancel1.data.pedido.estado, 'CANCELADO');

    // Cancelar dos veces -> 409
    const cancel2 = await req(
      'POST',
      `/api/public/pedidos/${taxiOrder.data.pedido.codigo}/cancelar`,
      { cliente_telefono: '+51984998877' }
    );
    assert.equal(cancel2.status, 409);

    const resumenAfterCancel = await req('GET', `/api/negocio/${tx2Id}/resumen`, undefined, tx2Token);
    assert.equal(resumenAfterCancel.data.negocio.saldo, 10000);
    assert.equal(resumenAfterCancel.data.negocio.saldo_retenido, 0);

    assert.equal(auditarLibroContable(db).cuadra, true);
  } finally {
    server.close();
  }
});

test('4. Bloqueo tras 5 PIN incorrectos (423) y flujo completo de reserva referida 10%+10%', async () => {
  const { db, server, req } = await startTestServer();
  try {
    // Configurar regla TURISMO: 10% plataforma + 10% referido
    const loginAdmin = await req('POST', '/api/admin/login', { pin: '998877' });
    const adminToken = loginAdmin.data.token;
    const ruleUpd = await req(
      'PUT',
      '/api/admin/reglas-comision/TURISMO',
      { porcentaje_plataforma: 10, porcentaje_referido: 10 },
      adminToken
    );
    assert.equal(ruleUpd.status, 200);

    // Parte A: 5 PIN incorrectos bloquean pedido aunque luego se envíe el PIN correcto
    const dir = await req('GET', '/api/public/directorio');
    const farmacia = dir.data.negocios.find((n: any) => n.codigo === 'NEG-FA-01');
    const med = dir.data.servicios.find((s: any) => s.negocio_id === farmacia.id);

    const pedFarm = await req('POST', '/api/public/pedidos', {
      negocio_id: farmacia.id,
      servicio_id: med.id,
      categoria: 'FARMACIA',
      metodo_pago: 'Yape',
      cliente_nombre: 'Lucas Mendoza',
      cliente_telefono: '+51984555111',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
    });
    assert.equal(pedFarm.status, 201);
    const rightPin = pedFarm.data.cliente_pin;

    const loginFarm = await req('POST', '/api/negocio/login', { codigo: 'NEG-FA-01', pin: '7531' });
    const farmToken = loginFarm.data.token;

    // PIN no debe aparecer en bandeja del negocio
    const bandejaFarm = await req('GET', `/api/negocio/${farmacia.id}/pedidos`, undefined, farmToken);
    const ordenEnBandeja = bandejaFarm.data.pedidos.find((p: any) => p.id === pedFarm.data.pedido.id);
    assert.equal(ordenEnBandeja.pin_hash, undefined);
    assert.equal(ordenEnBandeja.pin_salt, undefined);
    assert.equal(ordenEnBandeja.pin_prestador, undefined);

    await req(
      'POST',
      `/api/negocio/${farmacia.id}/pedidos/${pedFarm.data.pedido.id}/aceptar`,
      {},
      farmToken
    );

    const wrongPin = rightPin === '9182' ? '8273' : '9182';
    for (let i = 1; i <= 4; i++) {
      const r = await req(
        'POST',
        `/api/negocio/${farmacia.id}/pedidos/${pedFarm.data.pedido.id}/entregar`,
        { pin: wrongPin },
        farmToken
      );
      assert.equal(r.status, 400);
    }
    // 5to intento -> 423
    const fifth = await req(
      'POST',
      `/api/negocio/${farmacia.id}/pedidos/${pedFarm.data.pedido.id}/entregar`,
      { pin: wrongPin },
      farmToken
    );
    assert.equal(fifth.status, 423);

    // Ahora intenta con el PIN CORRECTO -> sigue bloqueado (423)!
    const afterLock = await req(
      'POST',
      `/api/negocio/${farmacia.id}/pedidos/${pedFarm.data.pedido.id}/entregar`,
      { pin: rightPin },
      farmToken
    );
    assert.equal(afterLock.status, 423);

    // Parte B: Reserva referida (Taxista NEG-TX-01 reserva guía S/ 100.00 -> 10% + 10%)
    const loginGuia = await req('POST', '/api/negocio/login', { codigo: 'NEG-TU-01', pin: '3691' });
    const guiaId = loginGuia.data.negocio.id;
    const guiaToken = loginGuia.data.token;
    const saldoInicialGuia = loginGuia.data.negocio.saldo;

    // Creamos un servicio exacto de S/ 100.00 (10000 centavos) para verificar el cálculo exacto del PDF
    const newTour = await req(
      'POST',
      `/api/negocio/${guiaId}/servicios`,
      { nombre: 'Tour Privado S/ 100', precio_centavos: 10000, duracion_min: 180, stock: 5 },
      guiaToken
    );
    assert.equal(newTour.status, 201);

    const loginTx1 = await req('POST', '/api/negocio/login', { codigo: 'NEG-TX-01', pin: '2468' });
    const tx1Id = loginTx1.data.negocio.id;
    const tx1Token = loginTx1.data.token;
    const saldoInicialTx1 = loginTx1.data.negocio.saldo;

    const reserva = await req(
      'POST',
      `/api/negocio/${tx1Id}/reservas-referidas`,
      {
        negocio_destino_id: guiaId,
        servicio_id: newTour.data.servicio.id,
        cliente_nombre: 'Emma Watson',
        cliente_telefono: '+51999111222',
      },
      tx1Token
    );
    assert.equal(reserva.status, 201);
    // El taxista referidor NUNCA ve el PIN en la respuesta ni en su lista
    assert.equal(reserva.data.pedido.pin_prestador, undefined);
    assert.equal(reserva.data.pedido.pin_cifrado, undefined);

    // El guía acepta (retiene 2000 = 20 soles)
    const guiaAccept = await req(
      'POST',
      `/api/negocio/${guiaId}/pedidos/${reserva.data.pedido.id}/aceptar`,
      {},
      guiaToken
    );
    assert.equal(guiaAccept.status, 200);
    assert.equal(guiaAccept.data.pedido.comision_retenida_centavos, 2000);

    // El guía ve su PIN en su bandeja de PRESTADOR
    const guiaBandeja = await req(
      'GET',
      `/api/negocio/${guiaId}/pedidos?rol=PRESTADOR`,
      undefined,
      guiaToken
    );
    const refEnGuia = guiaBandeja.data.pedidos.find((p: any) => p.id === reserva.data.pedido.id);
    assert.match(refEnGuia.pin_prestador, /^\d{4}$/);

    // El guía NO puede validarse a sí mismo -> 403
    const selfValidate = await req(
      'POST',
      `/api/negocio/${guiaId}/pedidos/${reserva.data.pedido.id}/entregar`,
      { pin: refEnGuia.pin_prestador },
      guiaToken
    );
    assert.equal(selfValidate.status, 403);

    // El taxista referidor sí valida -> Guía -20, Taxista +10, Plataforma +10
    const refValidate = await req(
      'POST',
      `/api/negocio/${tx1Id}/pedidos/${reserva.data.pedido.id}/entregar`,
      { pin: refEnGuia.pin_prestador },
      tx1Token
    );
    assert.equal(refValidate.status, 200);
    assert.equal(refValidate.data.pedido.estado, 'ENTREGADO_PAGADO');

    const resGuia = await req('GET', `/api/negocio/${guiaId}/resumen`, undefined, guiaToken);
    const resTx1 = await req('GET', `/api/negocio/${tx1Id}/resumen`, undefined, tx1Token);
    assert.equal(resGuia.data.negocio.saldo, saldoInicialGuia - 2000);
    assert.equal(resTx1.data.negocio.saldo, saldoInicialTx1 + 1000);

    const audit = auditarLibroContable(db);
    assert.equal(audit.cuadra, true);
    assert.equal(audit.ingresos_plataforma_centavos, 1000);
  } finally {
    server.close();
  }
});

test('5. Separación estricta por categorías e inmutabilidad del libro contable', async () => {
  const { db, server, req } = await startTestServer();
  try {
    const dir = await req('GET', '/api/public/directorio');
    const taxiBiz = dir.data.negocios.find((n: any) => n.rubro === 'TRANSPORTE');
    const tourBiz1 = dir.data.negocios.find((n: any) => n.codigo === 'NEG-TU-01');
    const tourItem = dir.data.servicios.find(
      (s: any) => s.categoria === 'TURISMO' && s.negocio_id === tourBiz1.id
    );

    // Intento de enviar un tour al negocio de taxi -> rechazado 400
    const mismatch1 = await req('POST', '/api/public/pedidos', {
      negocio_id: taxiBiz.id,
      servicio_id: tourItem.id,
      categoria: 'TURISMO',
      metodo_pago: 'Efectivo',
      cliente_nombre: 'Test Mismatch',
      cliente_telefono: '+51984000111',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
    });
    assert.equal(mismatch1.status, 400);

    // Intento de enviar servicio_id de otro negocio aunque coincida categoría -> rechazado 400
    const tourBiz2 = dir.data.negocios.find((n: any) => n.codigo === 'NEG-TU-02');
    const mismatch2 = await req('POST', '/api/public/pedidos', {
      negocio_id: tourBiz2.id,
      servicio_id: tourItem.id, // pertenece a NEG-TU-01
      categoria: 'TURISMO',
      metodo_pago: 'Efectivo',
      cliente_nombre: 'Test Cross Item',
      cliente_telefono: '+51984000112',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
    });
    assert.equal(mismatch2.status, 400);

    // Inmutabilidad SQLite de ledger_movimientos
    assert.throws(() => {
      db.prepare('UPDATE ledger_movimientos SET monto_centavos = 999999 WHERE id = 1').run();
    }, /inmutable/);
    assert.throws(() => {
      db.prepare('DELETE FROM ledger_movimientos WHERE id = 1').run();
    }, /inmutable/);
  } finally {
    server.close();
  }
});

test('6. Producción sin secretos falla al arrancar, expiración automática libera retención, butacas sin choques', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevJwt = process.env.JWT_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'corto';
    assert.throws(() => validateProductionEnv(), /JWT_SECRET/);
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.JWT_SECRET = prevJwt;
  }

  const { db, server, req } = await startTestServer();
  try {
    // Probar choque de butacas: asiento 2 ya reservado en seed
    const butacas = await req('GET', '/api/public/butacas');
    const ruta1 = butacas.data.rutas[0];
    const choque = await req('POST', '/api/public/butacas/reservar', {
      asiento_servicio_id: ruta1.id,
      asiento_numero: 2,
      cliente_nombre: 'Otro Pasajero',
      cliente_telefono: '+51999888777',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
    });
    assert.equal(choque.status, 409);

    // Probar expiración automática de pedido aceptado liberando retención
    const dir = await req('GET', '/api/public/directorio');
    const rest = dir.data.negocios.find((n: any) => n.codigo === 'NEG-RE-01');
    const plato = dir.data.servicios.find((s: any) => s.negocio_id === rest.id);
    const ped = await req('POST', '/api/public/pedidos', {
      negocio_id: rest.id,
      servicio_id: plato.id,
      categoria: 'RESTAURANTE',
      metodo_pago: 'Tarjeta',
      cliente_nombre: 'Ana Prado',
      cliente_telefono: '+51984321654',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
    });
    const loginRest = await req('POST', '/api/negocio/login', { codigo: 'NEG-RE-01', pin: '5792' });
    await req(
      'POST',
      `/api/negocio/${rest.id}/pedidos/${ped.data.pedido.id}/aceptar`,
      {},
      loginRest.data.token
    );
    // Simular vencimiento
    db.prepare("UPDATE pedidos_ordenes SET expires_at = datetime('now', '-5 minutes') WHERE id = ?").run(
      ped.data.pedido.id
    );
    const expiredCount = expireStaleOrders(db);
    assert.equal(expiredCount, 1);

    const resumenRest = await req('GET', `/api/negocio/${rest.id}/resumen`, undefined, loginRest.data.token);
    assert.equal(resumenRest.data.negocio.saldo_retenido, 0);
    assert.equal(auditarLibroContable(db).cuadra, true);
  } finally {
    server.close();
  }
});

test('7. Panel Multinegocio: auto-registro, configuración de horario/pagos/voz, flota de taxis, cambio de PIN y RBAC', async () => {
  const { server, req } = await startTestServer();
  try {
    // Auto-registro de un nuevo negocio de transporte
    const reg = await req('POST', '/api/public/negocios/registro', {
      rubro: 'TRANSPORTE',
      nombre: 'Taxis Imperiales Cusco',
      telefono: '+51984777888',
      zona: 'San Sebastián, Cusco',
      pin: '4321',
    });
    assert.equal(reg.status, 201);
    assert.ok(reg.data.token);
    assert.equal(reg.data.negocio.rubro, 'TRANSPORTE');
    const bizId = reg.data.negocio.id;
    const bizToken = reg.data.token;
    const bizCodigo = reg.data.negocio.codigo;

    // Otro negocio NO puede configurar este panel -> 403
    const loginOther = await req('POST', '/api/negocio/login', { codigo: 'NEG-TX-01', pin: '2468' });
    const crossCfg = await req(
      'PUT',
      `/api/negocio/${bizId}/configuracion`,
      { nombre: 'Hackeado' },
      loginOther.data.token
    );
    assert.equal(crossCfg.status, 403);

    // El negocio dueño configura horario 24h, pagos, tarifa mínima, radio y alerta de voz
    const cfg = await req(
      'PUT',
      `/api/negocio/${bizId}/configuracion`,
      {
        nombre: 'Taxis Imperiales VIP',
        zona: 'Av. De La Cultura 800, Cusco',
        abierto_24h: true,
        horario_apertura: '05:00',
        horario_cierre: '23:30',
        metodos_pago_aceptados: 'Yape,Plin,Efectivo',
        auto_aceptar_pedidos: true,
        alerta_voz_activa: true,
        tarifa_minima_centavos: 800,
        radio_cobertura_km: 15,
      },
      bizToken
    );
    assert.equal(cfg.status, 200);
    assert.equal(cfg.data.negocio.nombre, 'Taxis Imperiales VIP');
    assert.equal(cfg.data.negocio.abierto_24h, true);
    assert.equal(cfg.data.negocio.metodos_pago_aceptados, 'Yape,Plin,Efectivo');
    assert.equal(cfg.data.negocio.tarifa_minima_centavos, 800);
    assert.equal(cfg.data.negocio.radio_cobertura_km, 15);

    // Registra una unidad de taxi y actualiza su estado
    const unitRes = await req(
      'POST',
      `/api/negocio/${bizId}/unidades`,
      {
        conductor_nombre: 'Mateo Quispe',
        placa: 'X9Z-404',
        modelo: 'Toyota Corolla Hybrid',
        color: 'Negro',
        tarifa_base_centavos: 800,
        tarifa_km_centavos: 240,
      },
      bizToken
    );
    assert.equal(unitRes.status, 201);
    const unitId = unitRes.data.unidad.id;

    const unitPatch = await req(
      'PATCH',
      `/api/negocio/${bizId}/unidades/${unitId}`,
      { estado: 'OCUPADO' },
      bizToken
    );
    assert.equal(unitPatch.status, 200);
    assert.equal(unitPatch.data.unidad.estado, 'OCUPADO');

    // Rotación de PIN del panel
    const pinFail = await req(
      'PUT',
      `/api/negocio/${bizId}/pin`,
      { pin_actual: '0000', pin_nuevo: '8765' },
      bizToken
    );
    assert.equal(pinFail.status, 401);

    const pinOk = await req(
      'PUT',
      `/api/negocio/${bizId}/pin`,
      { pin_actual: '4321', pin_nuevo: '8765' },
      bizToken
    );
    assert.equal(pinOk.status, 200);

    // Verifica que inicia sesión con el nuevo PIN
    const relogin = await req('POST', '/api/negocio/login', { codigo: bizCodigo, pin: '8765' });
    assert.equal(relogin.status, 200);
  } finally {
    server.close();
  }
});

test('8. RENIEC/SUNAT, categorías/modalidades, DNI en market, reglas de negocio y entidades SOS', async () => {
  const { db, server, req } = await startTestServer();
  try {
    // 1. Consulta RENIEC / SUNAT con validación estricta
    const badDni = await req('GET', '/api/public/consulta-documento?tipo=DNI&numero=123');
    assert.equal(badDni.status, 400);

    const okDni = await req('GET', '/api/public/consulta-documento?tipo=DNI&numero=44556677');
    assert.equal(okDni.status, 200);
    assert.equal(okDni.data.valid, true);
    assert.equal(okDni.data.tipo, 'DNI');
    assert.equal(okDni.data.numero, '44556677');
    assert.ok(String(okDni.data.nombre_completo || '').length >= 4);

    // 20601234565 posee dígito verificador SUNAT válido
    const okRuc = await req('GET', '/api/public/consulta-documento?tipo=RUC&numero=20601234565');
    assert.equal(okRuc.status, 200);
    assert.equal(okRuc.data.valid, true);
    assert.equal(okRuc.data.tipo, 'RUC');
    assert.equal(okRuc.data.numero, '20601234565');

    // 2. Registro de negocio con RUC, categoría y modalidades + servicio por Arroba
    const regBiz = await req('POST', '/api/public/negocios/registro', {
      rubro: 'RESTAURANTE',
      nombre: 'Market Andino San Blas',
      telefono: '984665544',
      zona: 'San Blas, Cusco',
      pin: '6543',
      tipo_persona: 'JURIDICA',
      documento_tipo: 'RUC',
      documento_numero: '20601234565',
      razon_social: 'MARKET ANDINO SAN BLAS S.A.C.',
      tipo_negocio: 'Minimarket / Bodega',
      modalidades_venta: 'Kilo,Arroba,Unidad',
    });
    assert.equal(regBiz.status, 201);
    const bizId = regBiz.data.negocio.id;
    const bizCodigo = regBiz.data.negocio.codigo;
    const bizToken = regBiz.data.token;
    assert.equal(regBiz.data.negocio.documento_tipo, 'RUC');
    assert.equal(regBiz.data.negocio.documento_numero, '20601234565');
    assert.equal(regBiz.data.negocio.tipo_negocio, 'Minimarket / Bodega');
    assert.equal(regBiz.data.negocio.modalidades_venta, 'Kilo,Arroba,Unidad');

    const svcRes = await req(
      'POST',
      `/api/negocio/${bizId}/servicios`,
      {
        nombre: 'Papa Huayro Seleccionada',
        descripcion: 'Cosecha directa del Valle Sagrado',
        precio_centavos: 2800,
        duracion_min: 15,
        stock: 30,
        unidad_medida: 'Arroba',
      },
      bizToken
    );
    assert.equal(svcRes.status, 201);
    assert.equal(svcRes.data.servicio.unidad_medida, 'Arroba');

    const dirRes = await req('GET', '/api/public/directorio');
    assert.equal(dirRes.status, 200);
    const listedBiz = dirRes.data.negocios.find((n: any) => n.id === bizId);
    assert.ok(listedBiz);
    assert.equal(listedBiz.tipo_negocio, 'Minimarket / Bodega');
    assert.equal(listedBiz.modalidades_venta, 'Kilo,Arroba,Unidad');
    const listedSvc = dirRes.data.servicios.find((s: any) => s.id === svcRes.data.servicio.id);
    assert.ok(listedSvc);
    assert.equal(listedSvc.unidad_medida, 'Arroba');

    // 3. Pedido desde comparador de markets con DNI verificado RENIEC
    const marketOrder = await req('POST', '/api/public/market-pedidos', {
      market_nombre: 'Market Andino San Blas',
      market_zona: 'San Blas, Cusco',
      items_resumen: '1x Arroba Papa Huayro + 2x Leche Gloria',
      monto_centavos: 4180,
      metodo_pago: 'Yape',
      cliente_nombre: 'Lucia Mamani Quispe',
      cliente_telefono: '984123456',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
      tipo_entrega: 'DELIVERY',
    });
    assert.equal(marketOrder.status, 201);
    assert.equal(marketOrder.data.pedido.cliente_documento_tipo, 'DNI');
    assert.equal(marketOrder.data.pedido.cliente_documento_numero, '44556677');
    assert.equal(marketOrder.data.pedido.cliente_documento_verificado, 1);

    // Verificar persistencia para el panel receptor del negocio
    const receptorRow = db
      .prepare('SELECT id, codigo FROM negocios WHERE id = ?')
      .get(marketOrder.data.pedido.negocio_id) as { id: number; codigo: string } | undefined;
    assert.ok(receptorRow);
    const storedOrder = db
      .prepare(
        'SELECT cliente_documento_tipo, cliente_documento_numero, cliente_documento_verificado FROM pedidos_ordenes WHERE id = ?'
      )
      .get(marketOrder.data.pedido.id) as any;
    assert.equal(storedOrder.cliente_documento_tipo, 'DNI');
    assert.equal(storedOrder.cliente_documento_numero, '44556677');
    assert.equal(storedOrder.cliente_documento_verificado, 1);

    // 4. Reglas de activación/suspensión por admin (ESTAFA -> bloquea login 403 -> ACTIVO restaura 200)
    const loginAdmin = await req('POST', '/api/admin/login', { pin: '998877' });
    assert.equal(loginAdmin.status, 200);
    const adminToken = loginAdmin.data.token;

    const suspendEstafa = await req(
      'PATCH',
      `/api/admin/negocios/${bizId}/estado`,
      {
        estado_regla: 'ESTAFA',
        activo: false,
        motivo_estado: 'Cobro indebido reportado por cliente',
      },
      adminToken
    );
    assert.equal(suspendEstafa.status, 200);
    assert.equal(suspendEstafa.data.activo, false);
    assert.equal(suspendEstafa.data.estado_regla, 'ESTAFA');

    const blockedLogin = await req('POST', '/api/negocio/login', { codigo: bizCodigo, pin: '6543' });
    assert.equal(blockedLogin.status, 403);
    assert.match(String(blockedLogin.data.error || ''), /ESTAFA/i);

    const reactivate = await req(
      'PATCH',
      `/api/admin/negocios/${bizId}/estado`,
      { estado_regla: 'ACTIVO', activo: true },
      adminToken
    );
    assert.equal(reactivate.status, 200);
    assert.equal(reactivate.data.activo, true);
    assert.equal(reactivate.data.estado_regla, 'ACTIVO');

    const restoredLogin = await req('POST', '/api/negocio/login', { codigo: bizCodigo, pin: '6543' });
    assert.equal(restoredLogin.status, 200);

    // 5. Alerta SOS dirigida a entidad específica (SERENAZGO)
    const sosRes = await req('POST', '/api/public/emergencias', {
      cliente_nombre: 'Carlos Huaman',
      cliente_telefono: '984776655',
      ubicacion_texto: 'Plaza San Blas, Cusco',
      lat: -13.5149,
      lng: -71.9742,
      mensaje: 'Auxilio inmediato en San Blas',
      entidad_objetivo: 'SERENAZGO',
    });
    assert.equal(sosRes.status, 201);
    assert.equal(sosRes.data.entidad_objetivo, 'SERENAZGO');

    const sosList = await req('GET', '/api/public/emergencias');
    assert.equal(sosList.status, 200);
    const createdSos = sosList.data.emergencias.find((e: any) => e.codigo === sosRes.data.codigo);
    assert.ok(createdSos);
    assert.equal(createdSos.entidad_objetivo, 'SERENAZGO');
  } finally {
    server.close();
  }
});

test('9. Proxy HeyGen Interactive Avatar WebRTC: estado público seguro y validación de sesión/habla', async () => {
  const prevKey = process.env.HEYGEN_API_KEY;
  delete process.env.HEYGEN_API_KEY;
  const { server, req } = await startTestServer();
  try {
    const statusRes = await req('GET', '/api/public/avatar/status');
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data.configured, false);
    assert.equal(statusRes.data.provider, 'realistic-local');
    assert.equal('apiKey' in statusRes.data, false);

    // Sin HEYGEN_API_KEY en el servidor, crear sesión WebRTC responde 503 para degradar al motor local
    const sessionRes = await req('POST', '/api/public/avatar/session', {});
    assert.equal(sessionRes.status, 503);

    // Validación de campos obligatorios en /start, /ice y /speak
    const badStart = await req('POST', '/api/public/avatar/start', { session_id: '' });
    assert.equal(badStart.status, 400);

    const badSpeak = await req('POST', '/api/public/avatar/speak', {
      session_id: 'demo-session',
      text: '',
    });
    assert.equal(badSpeak.status, 400);

    const badStop = await req('POST', '/api/public/avatar/stop', { session_id: '' });
    assert.equal(badStop.status, 400);
  } finally {
    if (prevKey !== undefined) process.env.HEYGEN_API_KEY = prevKey;
    server.close();
  }
});

test('10. DNI/RUC en pedidos de taxi/market y emisión de Boleta/Factura Electrónica con IGV al entregar', async () => {
  const { db, server, req } = await startTestServer();
  try {
    const loginAdmin = await req('POST', '/api/admin/login', { pin: '998877' });
    assert.equal(loginAdmin.status, 200);
    const adminToken = loginAdmin.data.token;

    const loginTx1 = await req('POST', '/api/negocio/login', { codigo: 'NEG-TX-01', pin: '2468' });
    assert.equal(loginTx1.status, 200);
    const tx1Id = loginTx1.data.negocio.id;
    const tx1Token = loginTx1.data.token;

    await req(
      'POST',
      '/api/admin/ajustes-saldo',
      { negocio_id: tx1Id, delta_centavos: 10000, motivo: 'Saldo para test facturación' },
      adminToken
    );

    const dir = await req('GET', '/api/public/directorio');
    const unitTx1 = dir.data.unidades.find((u: any) => u.negocio_id === tx1Id);
    assert.ok(unitTx1);

    // 1) Pedido de taxi como EMPRESA con RUC (debe emitir FACTURA F001-... al entregar)
    const rucLookup = await req('GET', '/api/public/consulta-documento?tipo=RUC&numero=20601234565');
    assert.equal(rucLookup.status, 200);
    assert.equal(rucLookup.data.valid, true);

    const taxiRuc = await req('POST', '/api/public/taxi/pedir', {
      unidad_id: unitTx1.id,
      metodo_pago: 'Tarjeta',
      cliente_nombre: 'INVERSIONES CUSCO SAC',
      cliente_telefono: '+51984112233',
      cliente_documento_tipo: 'RUC',
      cliente_documento_numero: '20601234565',
      cliente_documento_verificado: true,
      cliente_direccion_fiscal: 'AV. EL SOL 450, CUSCO',
      destino_texto: 'Aeropuerto Velasco Astete',
    });
    assert.equal(taxiRuc.status, 201);
    const rucPedido = taxiRuc.data.pedido;
    const rucPin = taxiRuc.data.cliente_pin;
    assert.equal(rucPedido.cliente_documento_tipo, 'RUC');
    assert.equal(rucPedido.cliente_documento_numero, '20601234565');
    assert.equal(rucPedido.cliente_direccion_fiscal, 'AV. EL SOL 450, CUSCO');
    assert.equal(rucPedido.comprobante_tipo, 'FACTURA');

    // Aceptar pedido
    const acceptRuc = await req(
      'POST',
      `/api/negocio/${tx1Id}/pedidos/${rucPedido.id}/aceptar`,
      {},
      tx1Token
    );
    assert.equal(acceptRuc.status, 200);

    // Antes de entregar, comprobante retorna 409
    const preComp = await req('GET', `/api/public/pedidos/${rucPedido.codigo}/comprobante`);
    assert.equal(preComp.status, 409);

    // Entregar con PIN -> emite Factura F001-... con desglose IGV 18%
    const deliverRuc = await req(
      'POST',
      `/api/negocio/${tx1Id}/pedidos/${rucPedido.id}/entregar`,
      { pin: rucPin },
      tx1Token
    );
    assert.equal(deliverRuc.status, 200);
    assert.ok(deliverRuc.data.comprobante);
    assert.equal(deliverRuc.data.comprobante.tipo, 'FACTURA');
    assert.equal(deliverRuc.data.comprobante.serie, 'F001');
    assert.match(deliverRuc.data.comprobante.numero_completo, /^F001-\d{8}$/);
    assert.equal(deliverRuc.data.comprobante.receptor.tipo_doc, 'RUC');
    assert.equal(deliverRuc.data.comprobante.receptor.numero_doc, '20601234565');
    assert.equal(deliverRuc.data.comprobante.receptor.direccion, 'AV. EL SOL 450, CUSCO');
    assert.equal(
      deliverRuc.data.comprobante.op_gravada_centavos + deliverRuc.data.comprobante.igv_centavos,
      deliverRuc.data.comprobante.total_centavos
    );

    const postComp = await req('GET', `/api/public/pedidos/${rucPedido.codigo}/comprobante`);
    assert.equal(postComp.status, 200);
    assert.equal(
      postComp.data.comprobante.numero_completo,
      deliverRuc.data.comprobante.numero_completo
    );

    // 2) Pedido de Market como PERSONA NATURAL con DNI (debe emitir BOLETA B001-... al entregar)
    const mktRes = await req('POST', '/api/public/market-pedidos', {
      market_nombre: 'Supermercados Orión Cusco',
      market_zona: 'Cusco Centro',
      tipo_entrega: 'DELIVERY',
      items_resumen: '1x Leche Evaporada Gloria, 1x Atún',
      monto_centavos: 1180,
      metodo_pago: 'Yape',
      cliente_nombre: 'LUCÍA QUISPE CCORI',
      cliente_telefono: '+51984334455',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
      cliente_documento_verificado: true,
    });
    assert.equal(mktRes.status, 201);
    const mktPedido = mktRes.data.pedido;
    assert.equal(mktPedido.cliente_documento_tipo, 'DNI');
    assert.equal(mktPedido.cliente_documento_numero, '44556677');
    assert.equal(mktPedido.comprobante_tipo, 'BOLETA');

    const mktNegId = mktPedido.negocio_id;
    // Asegurar saldo en el negocio asignado al market para completar entrega
    await req(
      'POST',
      '/api/admin/ajustes-saldo',
      { negocio_id: mktNegId, delta_centavos: 5000, motivo: 'Saldo market boleta test' },
      adminToken
    );

    const negRow = db
      .prepare('SELECT codigo FROM negocios WHERE id = ?')
      .get(mktNegId) as { codigo: string } | undefined;
    assert.ok(negRow);
    const { hash, salt } = hashPin('4455');
    db.prepare('UPDATE seguridad_credenciales SET pin_hash = ?, pin_salt = ? WHERE negocio_id = ?').run(
      hash,
      salt,
      mktNegId
    );
    const loginMkt = await req('POST', '/api/negocio/login', {
      codigo: negRow.codigo,
      pin: '4455',
    });
    assert.equal(loginMkt.status, 200);
    const mktToken = loginMkt.data.token;

    const accMkt = await req(
      'POST',
      `/api/negocio/${mktNegId}/pedidos/${mktPedido.id}/aceptar`,
      {},
      mktToken
    );
    assert.equal(accMkt.status, 200);

    const delMkt = await req(
      'POST',
      `/api/negocio/${mktNegId}/pedidos/${mktPedido.id}/entregar`,
      { pin: mktRes.data.cliente_pin },
      mktToken
    );
    assert.equal(delMkt.status, 200);
    assert.equal(delMkt.data.comprobante.tipo, 'BOLETA');
    assert.equal(delMkt.data.comprobante.serie, 'B001');
    assert.match(delMkt.data.comprobante.numero_completo, /^B001-\d{8}$/);
    assert.equal(delMkt.data.comprobante.total_centavos, 1180);
    assert.equal(delMkt.data.comprobante.op_gravada_centavos, 1000);
    assert.equal(delMkt.data.comprobante.igv_centavos, 180);

    assert.equal(auditarLibroContable(db).cuadra, true);
  } finally {
    server.close();
  }
});

test('11. Regla estricta: sin DNI o RUC del titular NO se permite reservar taxi, negocio, market, divisas ni butacas (HTTP 400)', async () => {
  const { server, req } = await startTestServer();
  try {
    const dir = await req('GET', '/api/public/directorio');
    const unitTx1 = dir.data.unidades[0];
    const rest = dir.data.negocios.find((n: any) => n.codigo === 'NEG-RE-01');
    const plato = dir.data.servicios.find((s: any) => s.negocio_id === rest.id);
    const divisasRes = await req('GET', '/api/public/divisas');
    const divisaBiz = divisasRes.data.tasas[0];
    const butacasRes = await req('GET', '/api/public/butacas');
    const ruta = butacasRes.data.rutas[0];

    const noDniTaxi = await req('POST', '/api/public/taxi/pedir', {
      unidad_id: unitTx1.id,
      metodo_pago: 'Efectivo',
      cliente_nombre: 'Cliente Sin DNI',
      cliente_telefono: '+51984000999',
      destino_texto: 'Aeropuerto Cusco',
    });
    assert.equal(noDniTaxi.status, 400);
    assert.match(String(noDniTaxi.data.error || ''), /obligatorio/i);

    const noDniPedido = await req('POST', '/api/public/pedidos', {
      negocio_id: rest.id,
      servicio_id: plato.id,
      categoria: 'RESTAURANTE',
      metodo_pago: 'Yape',
      cliente_nombre: 'Cliente Sin DNI',
      cliente_telefono: '+51984000999',
    });
    assert.equal(noDniPedido.status, 400);
    assert.match(String(noDniPedido.data.error || ''), /obligatorio/i);

    const noDniMarket = await req('POST', '/api/public/market-pedidos', {
      market_nombre: 'Supermercados Orión Cusco',
      market_zona: 'Cusco Centro',
      items_resumen: '1x Leche',
      monto_centavos: 1000,
      metodo_pago: 'Yape',
      cliente_nombre: 'Cliente Sin DNI',
      cliente_telefono: '+51984000999',
      tipo_entrega: 'DELIVERY',
    });
    assert.equal(noDniMarket.status, 400);
    assert.match(String(noDniMarket.data.error || ''), /obligatorio/i);

    const noDniDivisa = await req('POST', '/api/public/divisas/reservar', {
      negocio_id: divisaBiz.negocio_id,
      moneda: divisaBiz.moneda_origen,
      operacion: 'COMPRA',
      monto_origen: 100,
      cliente_nombre: 'Cliente Sin DNI',
      cliente_telefono: '+51984000999',
    });
    assert.equal(noDniDivisa.status, 400);
    assert.match(String(noDniDivisa.data.error || ''), /obligatorio/i);

    const noDniButaca = await req('POST', '/api/public/butacas/reservar', {
      asiento_servicio_id: ruta.id,
      asiento_numero: 8,
      cliente_nombre: 'Cliente Sin DNI',
      cliente_telefono: '+51984000999',
    });
    assert.equal(noDniButaca.status, 400);
    assert.match(String(noDniButaca.data.error || ''), /obligatorio/i);

    // Con DNI válido las reservas de divisas y butacas sí proceden (201)
    const okDivisa = await req('POST', '/api/public/divisas/reservar', {
      negocio_id: divisaBiz.negocio_id,
      moneda: divisaBiz.moneda_origen,
      operacion: 'COMPRA',
      monto_origen: 100,
      cliente_nombre: 'Cliente Con DNI',
      cliente_telefono: '+51984000999',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
    });
    assert.equal(okDivisa.status, 201);
    assert.equal(okDivisa.data.cliente_documento_numero, '44556677');

    const okButaca = await req('POST', '/api/public/butacas/reservar', {
      asiento_servicio_id: ruta.id,
      asiento_numero: 8,
      cliente_nombre: 'Cliente Con DNI',
      cliente_telefono: '+51984000999',
      cliente_documento_tipo: 'DNI',
      cliente_documento_numero: '44556677',
    });
    assert.equal(okButaca.status, 201);
    assert.equal(okButaca.data.cliente_documento_numero, '44556677');
  } finally {
    server.close();
  }
});





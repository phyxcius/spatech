import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../backend/app.ts';
import { initDatabase, seedDatabase } from '../backend/db.ts';
import { auditarLibroContable, expireStaleOrders } from '../backend/finance.ts';
import { validateProductionEnv } from '../backend/security.ts';

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

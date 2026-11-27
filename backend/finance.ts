import type { DatabaseSync } from 'node:sqlite';
import { verifyPin } from './security.ts';
import { HttpError, type MetodoRecarga, type NegocioRow, type PedidoRow, type ReglaComisionRow } from './types.ts';

function runInTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // ignore rollback error
    }
    throw err;
  }
}

export function logWhatsAppNotification(
  db: DatabaseSync,
  destinatario: string,
  plantilla: string,
  pedidoCodigo: string | null,
  mensaje: string
): void {
  db.prepare(`
    INSERT INTO log_procesos_notificaciones (canal, destinatario, plantilla, pedido_codigo, mensaje, estado)
    VALUES ('WHATSAPP', ?, ?, ?, ?, 'ENVIADO')
  `).run(destinatario, plantilla, pedidoCodigo, mensaje);
}

export function solicitarRecarga(
  db: DatabaseSync,
  negocioId: number,
  montoCentavos: number,
  metodo: MetodoRecarga,
  codigoOperacion: string
) {
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0 || montoCentavos > 500000) {
    throw new HttpError(400, 'El monto debe estar entre S/ 1.00 y S/ 5,000.00');
  }
  const cleanCode = codigoOperacion.trim().toUpperCase();
  if (cleanCode.length < 4 || cleanCode.length > 64) {
    throw new HttpError(400, 'Código de operación inválido');
  }

  return runInTransaction(db, () => {
    const dup = db
      .prepare('SELECT id FROM negocios_recargas WHERE codigo_operacion = ?')
      .get(cleanCode) as { id: number } | undefined;
    if (dup) {
      throw new HttpError(409, 'Este código de operación ya fue registrado anteriormente');
    }
    const res = db
      .prepare(`
        INSERT INTO negocios_recargas (negocio_id, monto_centavos, metodo, codigo_operacion, estado)
        VALUES (?, ?, ?, ?, 'PENDIENTE')
      `)
      .run(negocioId, montoCentavos, metodo, cleanCode);
    return db
      .prepare('SELECT * FROM negocios_recargas WHERE id = ?')
      .get(Number(res.lastInsertRowid));
  });
}

export function aprobarRecarga(db: DatabaseSync, recargaId: number) {
  return runInTransaction(db, () => {
    const recarga = db
      .prepare('SELECT * FROM negocios_recargas WHERE id = ?')
      .get(recargaId) as
      | {
          id: number;
          negocio_id: number;
          monto_centavos: number;
          codigo_operacion: string;
          estado: string;
        }
      | undefined;
    if (!recarga) {
      throw new HttpError(404, 'Solicitud de recarga no encontrada');
    }
    if (recarga.estado !== 'PENDIENTE') {
      throw new HttpError(409, `La recarga ya fue procesada (${recarga.estado})`);
    }
    const negocio = db
      .prepare('SELECT * FROM negocios WHERE id = ?')
      .get(recarga.negocio_id) as unknown as NegocioRow | undefined;
    if (!negocio) {
      throw new HttpError(404, 'Negocio no encontrado');
    }

    const nuevoSaldo = negocio.saldo + recarga.monto_centavos;
    db.prepare(`
      UPDATE negocios_recargas
      SET estado = 'APROBADO', revisado_at = datetime('now')
      WHERE id = ?
    `).run(recargaId);

    db.prepare('UPDATE negocios SET saldo = ? WHERE id = ?').run(nuevoSaldo, negocio.id);

    db.prepare(`
      INSERT INTO ledger_movimientos
      (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
      VALUES ('NEGOCIO', ?, 'RECARGA', ?, 0, ?, ?, ?, 'Recarga aprobada por administrador')
    `).run(
      negocio.id,
      recarga.monto_centavos,
      nuevoSaldo,
      negocio.saldo_retenido,
      `REC-${recarga.codigo_operacion}`
    );

    return {
      recarga: db.prepare('SELECT * FROM negocios_recargas WHERE id = ?').get(recargaId),
      saldo: nuevoSaldo,
    };
  });
}

export function rechazarRecarga(db: DatabaseSync, recargaId: number, motivo: string) {
  const cleanMotivo = motivo.trim();
  if (cleanMotivo.length < 3) {
    throw new HttpError(400, 'El motivo de rechazo es obligatorio');
  }
  return runInTransaction(db, () => {
    const recarga = db
      .prepare('SELECT * FROM negocios_recargas WHERE id = ?')
      .get(recargaId) as { id: number; estado: string } | undefined;
    if (!recarga) throw new HttpError(404, 'Solicitud de recarga no encontrada');
    if (recarga.estado !== 'PENDIENTE') {
      throw new HttpError(409, `La recarga ya fue procesada (${recarga.estado})`);
    }
    db.prepare(`
      UPDATE negocios_recargas
      SET estado = 'RECHAZADO', motivo_rechazo = ?, revisado_at = datetime('now')
      WHERE id = ?
    `).run(cleanMotivo, recargaId);
    return db.prepare('SELECT * FROM negocios_recargas WHERE id = ?').get(recargaId);
  });
}

export function ajustarSaldoAdmin(
  db: DatabaseSync,
  negocioId: number,
  deltaCentavos: number,
  motivo: string
) {
  const cleanMotivo = motivo.trim();
  if (cleanMotivo.length < 3) {
    throw new HttpError(400, 'El motivo del ajuste manual es obligatorio');
  }
  if (!Number.isInteger(deltaCentavos) || deltaCentavos === 0) {
    throw new HttpError(400, 'El monto de ajuste debe ser un entero distinto de cero');
  }

  return runInTransaction(db, () => {
    const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as
      | NegocioRow
      | undefined;
    if (!negocio) throw new HttpError(404, 'Negocio no encontrado');

    const nuevoSaldo = negocio.saldo + deltaCentavos;
    if (nuevoSaldo < negocio.saldo_retenido) {
      throw new HttpError(
        409,
        `El débito excede el saldo libre disponible (disponible: S/ ${((negocio.saldo - negocio.saldo_retenido) / 100).toFixed(2)})`
      );
    }

    db.prepare('UPDATE negocios SET saldo = ? WHERE id = ?').run(nuevoSaldo, negocio.id);
    db.prepare(`
      INSERT INTO ledger_movimientos
      (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
      VALUES ('NEGOCIO', ?, 'AJUSTE', ?, 0, ?, ?, ?, ?)
    `).run(
      negocio.id,
      deltaCentavos,
      nuevoSaldo,
      negocio.saldo_retenido,
      `ADJ-${Date.now()}`,
      cleanMotivo
    );

    return {
      negocio_id: negocio.id,
      saldo_anterior: negocio.saldo,
      saldo_nuevo: nuevoSaldo,
      saldo_retenido: negocio.saldo_retenido,
    };
  });
}

export function aceptarPedido(db: DatabaseSync, pedidoId: number, negocioId: number) {
  return runInTransaction(db, () => {
    const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
      | PedidoRow
      | undefined;
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
    if (pedido.negocio_id !== negocioId) {
      throw new HttpError(403, 'Este pedido pertenece a otro negocio');
    }
    if (pedido.estado !== 'PENDIENTE_CONFIRMACION') {
      throw new HttpError(409, `El pedido ya está en estado ${pedido.estado}`);
    }

    const negocio = db.prepare('SELECT * FROM negocios WHERE id = ?').get(negocioId) as unknown as
      | NegocioRow
      | undefined;
    if (!negocio) throw new HttpError(404, 'Negocio no encontrado');
    if (pedido.categoria !== negocio.rubro) {
      throw new HttpError(403, 'La categoría del pedido no corresponde al rubro del negocio');
    }

    const regla = db
      .prepare('SELECT * FROM reglas_comision WHERE rubro = ?')
      .get(negocio.rubro) as unknown as ReglaComisionRow | undefined;
    const pctPlat = regla?.porcentaje_plataforma ?? 3;
    const pctRef = pedido.referido_negocio_id ? (regla?.porcentaje_referido ?? 0) : 0;

    const comPlat = Math.round((pedido.monto_centavos * pctPlat) / 100);
    const comRef = Math.round((pedido.monto_centavos * pctRef) / 100);
    const totalRetencion = comPlat + comRef;

    const saldoLibre = negocio.saldo - negocio.saldo_retenido;
    if (saldoLibre < totalRetencion) {
      throw new HttpError(402, 'Saldo insuficiente, recarga para continuar');
    }

    const nuevoRetenido = negocio.saldo_retenido + totalRetencion;
    db.prepare('UPDATE negocios SET saldo_retenido = ? WHERE id = ?').run(nuevoRetenido, negocio.id);

    if (totalRetencion > 0) {
      db.prepare(`
        INSERT INTO ledger_movimientos
        (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
        VALUES ('NEGOCIO', ?, 'RETENCION', 0, ?, ?, ?, ?, 'Retención al aceptar pedido')
      `).run(negocio.id, totalRetencion, negocio.saldo, nuevoRetenido, pedido.codigo);
    }

    db.prepare(`
      UPDATE pedidos_ordenes
      SET estado = 'CONFIRMADO_PREPARACION',
          viaje_etapa = CASE WHEN categoria = 'TRANSPORTE' THEN 'HACIA_PASAJERO' ELSE viaje_etapa END,
          comision_plataforma_centavos = ?,
          comision_referido_centavos = ?,
          comision_retenida_centavos = ?,
          expires_at = datetime('now', '+4 hours'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(comPlat, comRef, totalRetencion, pedido.id);

    if (pedido.unidad_id) {
      db.prepare("UPDATE unidades_conductores SET estado = 'OCUPADO' WHERE id = ?").run(
        pedido.unidad_id
      );
    }

    const plantilla = pedido.categoria === 'TRANSPORTE' ? 'tu_taxi_va_en_camino' : 'pedido_aceptado';
    const msg =
      pedido.categoria === 'TRANSPORTE'
        ? `Tu conductor ${negocio.nombre} aceptó el traslado ${pedido.codigo}. Llegada estimada: ${pedido.eta_min || 5} min.`
        : `Tu pedido ${pedido.codigo} en ${negocio.nombre} fue aceptado y está en preparación.`;
    logWhatsAppNotification(db, pedido.cliente_telefono, plantilla, pedido.codigo, msg);

    return db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedido.id) as unknown as PedidoRow;
  });
}

function assertActorPuedeValidarPedido(pedido: PedidoRow, actorNegocioId: number) {
  if (pedido.referido_negocio_id) {
    if (actorNegocioId === pedido.negocio_id) {
      throw new HttpError(
        403,
        'En una reserva referida solo el negocio que refirió puede validar el PIN'
      );
    }
    if (actorNegocioId !== pedido.referido_negocio_id) {
      throw new HttpError(403, 'No tienes permiso para validar este pedido referido');
    }
  } else if (actorNegocioId !== pedido.negocio_id) {
    throw new HttpError(403, 'Este pedido pertenece a otro negocio');
  }
}

function liquidarYCompletarPedidoTx(db: DatabaseSync, pedido: PedidoRow) {
  const prestador = db.prepare('SELECT * FROM negocios WHERE id = ?').get(pedido.negocio_id) as unknown as NegocioRow;
  const totalComision = pedido.comision_retenida_centavos;
  const comPlat = pedido.comision_plataforma_centavos;
  const comRef = pedido.comision_referido_centavos;

  let saldoPrestador = prestador.saldo;
  let retenidoPrestador = prestador.saldo_retenido;

  if (totalComision > 0) {
    retenidoPrestador = prestador.saldo_retenido - totalComision;
    if (retenidoPrestador < 0) {
      throw new HttpError(409, 'Inconsistencia en saldo retenido');
    }
    db.prepare(`
      INSERT INTO ledger_movimientos
      (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
      VALUES ('NEGOCIO', ?, 'LIBERACION', 0, ?, ?, ?, ?, 'Liberación de retención al completar servicio')
    `).run(prestador.id, -totalComision, saldoPrestador, retenidoPrestador, pedido.codigo);

    saldoPrestador = saldoPrestador - totalComision;
    if (saldoPrestador < retenidoPrestador) {
      throw new HttpError(409, 'Saldo insuficiente para liquidar comisión');
    }

    db.prepare(`
      INSERT INTO ledger_movimientos
      (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
      VALUES ('NEGOCIO', ?, 'COMISION', ?, 0, ?, ?, ?, 'Cobro de comisión por servicio concretado')
    `).run(prestador.id, -totalComision, saldoPrestador, retenidoPrestador, pedido.codigo);

    db.prepare('UPDATE negocios SET saldo = ?, saldo_retenido = ? WHERE id = ?').run(
      saldoPrestador,
      retenidoPrestador,
      prestador.id
    );
  }

  if (pedido.referido_negocio_id && comRef > 0) {
    const referidor = db
      .prepare('SELECT * FROM negocios WHERE id = ?')
      .get(pedido.referido_negocio_id) as unknown as NegocioRow;
    const nuevoSaldoRef = referidor.saldo + comRef;
    db.prepare('UPDATE negocios SET saldo = ? WHERE id = ?').run(nuevoSaldoRef, referidor.id);
    db.prepare(`
      INSERT INTO ledger_movimientos
      (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
      VALUES ('NEGOCIO', ?, 'CREDITO_REFERIDO', ?, 0, ?, ?, ?, 'Crédito interno por reserva referida')
    `).run(referidor.id, comRef, nuevoSaldoRef, referidor.saldo_retenido, pedido.codigo);
  }

  if (comPlat > 0) {
    const platRow = db
      .prepare(
        "SELECT COALESCE(SUM(monto_centavos), 0) AS total FROM ledger_movimientos WHERE cuenta_tipo = 'PLATAFORMA'"
      )
      .get() as { total: number };
    const nuevoTotalPlat = platRow.total + comPlat;
    db.prepare(`
      INSERT INTO ledger_movimientos
      (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
      VALUES ('PLATAFORMA', NULL, 'INGRESO_PLATAFORMA', ?, 0, ?, 0, ?, 'Ingreso neto La Chuspa')
    `).run(comPlat, nuevoTotalPlat, pedido.codigo);
  }

  if (pedido.promotor_codigo) {
    const partner = db
      .prepare('SELECT * FROM partners_afiliados WHERE codigo = ? AND activo = 1')
      .get(pedido.promotor_codigo) as
      | { id: number; porcentaje_comision: number }
      | undefined;
    if (partner && comPlat > 0) {
      const bonoPartner = Math.round((comPlat * partner.porcentaje_comision) / 100);
      if (bonoPartner > 0) {
        db.prepare(
          'INSERT INTO partner_comisiones (partner_id, pedido_id, monto_centavos) VALUES (?, ?, ?)'
        ).run(partner.id, pedido.id, bonoPartner);
      }
    }
  }

  const puntosGanados = Math.max(1, Math.round((pedido.monto_centavos / 100) * 0.15));
  db.prepare(`
    INSERT INTO usuarios_clientes (telefono, nombre, puntos)
    VALUES (?, ?, ?)
    ON CONFLICT(telefono) DO UPDATE SET
      nombre = excluded.nombre,
      puntos = usuarios_clientes.puntos + excluded.puntos
  `).run(pedido.cliente_telefono, pedido.cliente_nombre, puntosGanados);
  db.prepare(
    'INSERT INTO historial_puntos (telefono, pedido_codigo, puntos) VALUES (?, ?, ?)'
  ).run(pedido.cliente_telefono, pedido.codigo, puntosGanados);

  const isTaxi = pedido.categoria === 'TRANSPORTE';
  const compTipo = isTaxi
    ? null
    : pedido.cliente_documento_tipo === 'RUC'
      ? 'FACTURA'
      : 'BOLETA';
  const compSerie = compTipo ? (compTipo === 'FACTURA' ? 'F001' : 'B001') : null;
  const compNum = compTipo ? String(pedido.id).padStart(8, '0') : null;
  const sunatEstado = compTipo ? 'REPRESENTACION_IMPRESA' : null;

  db.prepare(`
    UPDATE pedidos_ordenes
    SET estado = 'ENTREGADO_PAGADO',
        pin_validado = 1,
        pin_validado_at = COALESCE(pin_validado_at, datetime('now')),
        viaje_etapa = CASE WHEN categoria = 'TRANSPORTE' THEN 'FINALIZADO' ELSE viaje_etapa END,
        comprobante_tipo = ?,
        comprobante_serie = ?,
        comprobante_numero = ?,
        comprobante_emitido_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE NULL END,
        comprobante_sunat_estado = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(compTipo, compSerie, compNum, compTipo, sunatEstado, pedido.id);

  if (pedido.unidad_id) {
    db.prepare("UPDATE unidades_conductores SET estado = 'DISPONIBLE' WHERE id = ?").run(
      pedido.unidad_id
    );
  }

  logWhatsAppNotification(
    db,
    pedido.cliente_telefono,
    'pedido_listo',
    pedido.codigo,
    isTaxi
      ? `Viaje ${pedido.codigo} completado con éxito. Ganaste ${puntosGanados} puntos La Chuspa.`
      : `Servicio ${pedido.codigo} completado con éxito. Ganaste ${puntosGanados} puntos La Chuspa. Comprobante ${compTipo} ${compSerie}-${compNum} listo para imprimir.`
  );

  return {
    pedido: db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedido.id) as unknown as PedidoRow,
    puntosGanados,
  };
}

export function validarSoloPin(
  db: DatabaseSync,
  pedidoId: number,
  actorNegocioId: number,
  pinIngresado: string
) {
  const cleanPin = (pinIngresado || '').trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new HttpError(400, 'El PIN de validación debe tener 4 dígitos');
  }

  let lockExceeded = false;
  let remainingAttempts = 0;

  const result = runInTransaction(db, () => {
    const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
      | PedidoRow
      | undefined;
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

    assertActorPuedeValidarPedido(pedido, actorNegocioId);

    if (pedido.estado !== 'CONFIRMADO_PREPARACION') {
      throw new HttpError(409, `El viaje debe estar en curso para validar PIN (estado: ${pedido.estado})`);
    }
    if (pedido.pin_bloqueado === 1 || pedido.intentos_pin >= 5) {
      throw new HttpError(423, 'PIN bloqueado por demasiados intentos fallidos. Solo puede cancelarse.');
    }

    if (pedido.pin_validado === 1) {
      if (pedido.viaje_etapa !== 'EN_RUTA_DESTINO' && pedido.viaje_etapa !== 'LLEGADO_DESTINO') {
        db.prepare(`
          UPDATE pedidos_ordenes
          SET viaje_etapa = 'EN_RUTA_DESTINO',
              updated_at = datetime('now')
          WHERE id = ?
        `).run(pedido.id);
        return db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedido.id) as unknown as PedidoRow;
      }
      return pedido;
    }

    const ok = verifyPin(cleanPin, pedido.pin_hash, pedido.pin_salt);
    if (!ok) {
      const nuevosIntentos = pedido.intentos_pin + 1;
      const bloqueado = nuevosIntentos >= 5 ? 1 : 0;
      db.prepare(`
        UPDATE pedidos_ordenes
        SET intentos_pin = ?, pin_bloqueado = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(nuevosIntentos, bloqueado, pedido.id);

      lockExceeded = bloqueado === 1;
      remainingAttempts = Math.max(0, 5 - nuevosIntentos);
      return null;
    }

    db.prepare(`
      UPDATE pedidos_ordenes
      SET pin_validado = 1,
          pin_validado_at = datetime('now'),
          viaje_etapa = 'EN_RUTA_DESTINO',
          updated_at = datetime('now')
      WHERE id = ?
    `).run(pedido.id);

    logWhatsAppNotification(
      db,
      pedido.cliente_telefono,
      'pasajero_abordo',
      pedido.codigo,
      `PIN verificado para el traslado ${pedido.codigo}. Viaje iniciado rumbo a ${pedido.destino_texto || 'tu destino'}.`
    );

    return db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedido.id) as unknown as PedidoRow;
  });

  if (result === null) {
    if (lockExceeded) {
      throw new HttpError(423, 'PIN bloqueado tras 5 intentos fallidos. El viaje solo puede cancelarse.');
    }
    throw new HttpError(400, `PIN incorrecto. Intentos restantes: ${remainingAttempts}`);
  }

  return { pedido: result };
}

export function actualizarEtapaViaje(
  db: DatabaseSync,
  pedidoId: number,
  actorNegocioId: number,
  etapa: 'EN_RUTA_DESTINO' | 'LLEGADO_DESTINO'
) {
  return runInTransaction(db, () => {
    const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
      | PedidoRow
      | undefined;
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
    assertActorPuedeValidarPedido(pedido, actorNegocioId);
    if (pedido.estado !== 'CONFIRMADO_PREPARACION') {
      throw new HttpError(409, 'El viaje no está activo');
    }
    if (pedido.pin_validado !== 1) {
      throw new HttpError(409, 'Valida primero el PIN de 4 dígitos del pasajero');
    }
    db.prepare(`
      UPDATE pedidos_ordenes
      SET viaje_etapa = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(etapa, pedido.id);

    if (etapa === 'LLEGADO_DESTINO') {
      logWhatsAppNotification(
        db,
        pedido.cliente_telefono,
        'llegada_destino',
        pedido.codigo,
        `¡Has llegado a tu destino (${pedido.destino_texto || 'Cusco'})! Código ${pedido.codigo}.`
      );
    }

    return db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedido.id) as unknown as PedidoRow;
  });
}

export function finalizarViajeConfirmado(
  db: DatabaseSync,
  pedidoId: number,
  actorNegocioId: number,
  pinOpcional?: string
) {
  let lockExceeded = false;
  let remainingAttempts = 0;

  const result = runInTransaction(db, () => {
    const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
      | PedidoRow
      | undefined;
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
    assertActorPuedeValidarPedido(pedido, actorNegocioId);

    if (pedido.estado !== 'CONFIRMADO_PREPARACION') {
      throw new HttpError(409, `El viaje debe estar en curso para finalizar (estado: ${pedido.estado})`);
    }
    if (pedido.pin_bloqueado === 1 || pedido.intentos_pin >= 5) {
      throw new HttpError(423, 'PIN bloqueado por demasiados intentos fallidos. Solo puede cancelarse.');
    }

    if (pedido.pin_validado !== 1) {
      const cleanPin = (pinOpcional || '').trim();
      if (!/^\d{4}$/.test(cleanPin)) {
        throw new HttpError(409, 'Debes validar primero el PIN de 4 dígitos del pasajero antes de finalizar el viaje.');
      }
      const ok = verifyPin(cleanPin, pedido.pin_hash, pedido.pin_salt);
      if (!ok) {
        const nuevosIntentos = pedido.intentos_pin + 1;
        const bloqueado = nuevosIntentos >= 5 ? 1 : 0;
        db.prepare(`
          UPDATE pedidos_ordenes
          SET intentos_pin = ?, pin_bloqueado = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(nuevosIntentos, bloqueado, pedido.id);
        lockExceeded = bloqueado === 1;
        remainingAttempts = Math.max(0, 5 - nuevosIntentos);
        return null;
      }
    }

    return liquidarYCompletarPedidoTx(db, pedido);
  });

  if (result === null) {
    if (lockExceeded) {
      throw new HttpError(423, 'PIN bloqueado tras 5 intentos fallidos. El pedido solo puede cancelarse.');
    }
    throw new HttpError(400, `PIN incorrecto. Intentos restantes: ${remainingAttempts}`);
  }

  return result;
}

export function validarPinYEntregar(
  db: DatabaseSync,
  pedidoId: number,
  actorNegocioId: number,
  pinIngresado: string
) {
  const cleanPin = (pinIngresado || '').trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new HttpError(400, 'El PIN de validación debe tener 4 dígitos');
  }

  let lockExceeded = false;
  let remainingAttempts = 0;

  const result = runInTransaction(db, () => {
    const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
      | PedidoRow
      | undefined;
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

    assertActorPuedeValidarPedido(pedido, actorNegocioId);

    if (pedido.estado !== 'CONFIRMADO_PREPARACION') {
      throw new HttpError(409, `El pedido debe estar en curso para validar PIN (estado: ${pedido.estado})`);
    }
    if (pedido.pin_bloqueado === 1 || pedido.intentos_pin >= 5) {
      throw new HttpError(423, 'PIN bloqueado por demasiados intentos fallidos. Solo puede cancelarse.');
    }

    const ok = verifyPin(cleanPin, pedido.pin_hash, pedido.pin_salt);
    if (!ok) {
      const nuevosIntentos = pedido.intentos_pin + 1;
      const bloqueado = nuevosIntentos >= 5 ? 1 : 0;
      db.prepare(`
        UPDATE pedidos_ordenes
        SET intentos_pin = ?, pin_bloqueado = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(nuevosIntentos, bloqueado, pedido.id);

      lockExceeded = bloqueado === 1;
      remainingAttempts = Math.max(0, 5 - nuevosIntentos);
      return null;
    }

    return liquidarYCompletarPedidoTx(db, pedido);
  });

  if (result === null) {
    if (lockExceeded) {
      throw new HttpError(423, 'PIN bloqueado tras 5 intentos fallidos. El pedido solo puede cancelarse.');
    }
    throw new HttpError(400, `PIN incorrecto. Intentos restantes: ${remainingAttempts}`);
  }

  return result;
}

export function cancelarPedido(
  db: DatabaseSync,
  pedidoId: number,
  motivo = 'Cancelado por el usuario'
) {
  return runInTransaction(db, () => {
    const pedido = db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedidoId) as unknown as
      | PedidoRow
      | undefined;
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado');

    if (pedido.estado !== 'PENDIENTE_CONFIRMACION' && pedido.estado !== 'CONFIRMADO_PREPARACION') {
      throw new HttpError(409, `No se puede cancelar un pedido en estado ${pedido.estado}`);
    }

    if (pedido.estado === 'CONFIRMADO_PREPARACION' && pedido.comision_retenida_centavos > 0) {
      const prestador = db.prepare('SELECT * FROM negocios WHERE id = ?').get(pedido.negocio_id) as unknown as NegocioRow;
      const nuevoRetenido = Math.max(0, prestador.saldo_retenido - pedido.comision_retenida_centavos);
      const delta = nuevoRetenido - prestador.saldo_retenido;
      db.prepare('UPDATE negocios SET saldo_retenido = ? WHERE id = ?').run(nuevoRetenido, prestador.id);
      db.prepare(`
        INSERT INTO ledger_movimientos
        (cuenta_tipo, negocio_id, tipo, monto_centavos, retenido_delta_centavos, saldo_posterior_centavos, retenido_posterior_centavos, referencia, motivo)
        VALUES ('NEGOCIO', ?, 'LIBERACION', 0, ?, ?, ?, ?, ?)
      `).run(prestador.id, delta, prestador.saldo, nuevoRetenido, pedido.codigo, motivo);
    }

    db.prepare(`
      UPDATE pedidos_ordenes
      SET estado = 'CANCELADO', motivo_cancelacion = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(motivo, pedido.id);

    if (pedido.unidad_id) {
      db.prepare("UPDATE unidades_conductores SET estado = 'DISPONIBLE' WHERE id = ?").run(
        pedido.unidad_id
      );
    }

    logWhatsAppNotification(
      db,
      pedido.cliente_telefono,
      'pedido_cancelado',
      pedido.codigo,
      `El pedido ${pedido.codigo} ha sido cancelado (${motivo}).`
    );

    return db.prepare('SELECT * FROM pedidos_ordenes WHERE id = ?').get(pedido.id) as unknown as PedidoRow;
  });
}

export function expireStaleOrders(db: DatabaseSync): number {
  const expired = db
    .prepare(`
      SELECT id FROM pedidos_ordenes
      WHERE estado IN ('PENDIENTE_CONFIRMACION', 'CONFIRMADO_PREPARACION')
        AND expires_at IS NOT NULL
        AND datetime(expires_at) <= datetime('now')
    `)
    .all() as Array<{ id: number }>;

  let count = 0;
  for (const row of expired) {
    try {
      cancelarPedido(db, row.id, 'Vencimiento automático por inactividad');
      count++;
    } catch {
      // already transitioned concurrently
    }
  }
  return count;
}

export function auditarLibroContable(db: DatabaseSync) {
  const negocios = db.prepare('SELECT id, codigo, nombre, rubro, saldo, saldo_retenido FROM negocios ORDER BY id').all() as Array<{
    id: number;
    codigo: string;
    nombre: string;
    rubro: string;
    saldo: number;
    saldo_retenido: number;
  }>;

  const sumStmt = db.prepare(`
    SELECT
      COALESCE(SUM(monto_centavos), 0) AS suma_saldo,
      COALESCE(SUM(retenido_delta_centavos), 0) AS suma_retenido
    FROM ledger_movimientos
    WHERE cuenta_tipo = 'NEGOCIO' AND negocio_id = ?
  `);

  const verificacion = negocios.map((n) => {
    const sums = sumStmt.get(n.id) as { suma_saldo: number; suma_retenido: number };
    const cuadraSaldo = sums.suma_saldo === n.saldo;
    const cuadraRetenido = sums.suma_retenido === n.saldo_retenido;
    return {
      negocio_id: n.id,
      codigo: n.codigo,
      nombre: n.nombre,
      rubro: n.rubro,
      saldo_cache: n.saldo,
      saldo_libro: sums.suma_saldo,
      retenido_cache: n.saldo_retenido,
      retenido_libro: sums.suma_retenido,
      cuadra: cuadraSaldo && cuadraRetenido,
    };
  });

  const platRow = db
    .prepare(
      "SELECT COALESCE(SUM(monto_centavos), 0) AS total FROM ledger_movimientos WHERE cuenta_tipo = 'PLATAFORMA'"
    )
    .get() as { total: number };

  const movimientos = db
    .prepare(`
      SELECT l.*, n.nombre AS negocio_nombre, n.codigo AS negocio_codigo
      FROM ledger_movimientos l
      LEFT JOIN negocios n ON n.id = l.negocio_id
      ORDER BY l.id DESC
      LIMIT 150
    `)
    .all();

  const cuadraGlobal = verificacion.every((v) => v.cuadra);

  return {
    cuadra: cuadraGlobal,
    ingresos_plataforma_centavos: platRow.total,
    verificacion_negocios: verificacion,
    movimientos,
  };
}

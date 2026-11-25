export interface ComprobanteApisperuInput {
  tipo: 'BOLETA' | 'FACTURA' | 'RECIBO';
  serie: string;
  numero: string;
  emitido_at: string;
  pedido_codigo: string;
  emisor: {
    ruc: string;
    razon_social: string;
    nombre_comercial: string;
    direccion: string;
  };
  receptor: {
    tipo_doc: 'DNI' | 'RUC' | 'EXTRANJERO';
    numero_doc: string;
    nombre: string;
    direccion: string;
  };
  items: Array<{
    cantidad: number;
    descripcion: string;
    valor_unitario_centavos: number;
    total_centavos: number;
  }>;
  op_gravada_centavos: number;
  igv_centavos: number;
  total_centavos: number;
}

export interface ApisperuBillingResult {
  sent: boolean;
  estado: 'ACEPTADO_SUNAT' | 'ENVIADO_APISPERU' | 'REPRESENTACION_IMPRESA' | 'LOCAL_SUNAT';
  hash: string | null;
  mensaje?: string | null;
}

export function isApisperuBillingConfigured(overrideToken?: string): boolean {
  return Boolean(((overrideToken || '').trim() || (process.env.APISPERU_FACTURACION_TOKEN || '').trim()));
}

export async function enviarComprobanteApisperu(
  categoria: string,
  comprobante: ComprobanteApisperuInput,
  overrideToken?: string
): Promise<ApisperuBillingResult> {
  // Regla estricta: taxis / transporte NUNCA emiten facturación electrónica
  if (categoria === 'TRANSPORTE') {
    return {
      sent: false,
      estado: 'LOCAL_SUNAT',
      hash: null,
      mensaje: 'Servicios de taxi no emiten comprobante electrónico.',
    };
  }

  const token = (overrideToken || '').trim() || (process.env.APISPERU_FACTURACION_TOKEN || '').trim();
  if (!token || process.env.NODE_ENV === 'test') {
    return {
      sent: false,
      estado: 'LOCAL_SUNAT',
      hash: null,
      mensaje: token ? 'Modo pruebas local' : 'Token de facturación Apisperu no configurado',
    };
  }

  const tipoDocSunat = comprobante.tipo === 'FACTURA' ? '01' : '03';
  const clientTipoDoc =
    comprobante.receptor.tipo_doc === 'RUC'
      ? '6'
      : comprobante.receptor.tipo_doc === 'EXTRANJERO'
        ? '7'
        : '1';

  const totalSoles = Number((comprobante.total_centavos / 100).toFixed(2));
  const gravadoSoles = Number((comprobante.op_gravada_centavos / 100).toFixed(2));
  const igvSoles = Number((comprobante.igv_centavos / 100).toFixed(2));
  const isoDate = new Date(comprobante.emitido_at || Date.now()).toISOString();

  const payload = {
    ublVersion: '2.1',
    tipoOperacion: '0101',
    tipoDoc: tipoDocSunat,
    serie: comprobante.serie,
    correlativo: comprobante.numero,
    fechaEmision: isoDate,
    formaPago: {
      moneda: 'PEN',
      tipo: 'Contado',
    },
    tipoMoneda: 'PEN',
    company: {
      ruc: comprobante.emisor.ruc,
      razonSocial: comprobante.emisor.razon_social,
      nombreComercial: comprobante.emisor.nombre_comercial,
      address: {
        ubigueo: '080101',
        departamento: 'CUSCO',
        provincia: 'CUSCO',
        distrito: 'CUSCO',
        direccion: comprobante.emisor.direccion || 'Cusco, Perú',
      },
    },
    client: {
      tipoDoc: clientTipoDoc,
      numDoc: comprobante.receptor.numero_doc,
      rznSocial: comprobante.receptor.nombre,
      address: {
        direccion: comprobante.receptor.direccion || 'Cusco, Perú',
      },
    },
    mtoOperGravadas: gravadoSoles,
    mtoIGV: igvSoles,
    totalImpuestos: igvSoles,
    valorVenta: gravadoSoles,
    subTotal: totalSoles,
    mtoImpVenta: totalSoles,
    details: comprobante.items.map((item, idx) => {
      const unitVal = Number((item.valor_unitario_centavos / 100).toFixed(2));
      const itemTotal = Number((item.total_centavos / 100).toFixed(2));
      const itemIgv = Number((itemTotal - unitVal).toFixed(2));
      return {
        codProducto: `LCH-${idx + 1}`,
        unidad: 'NIU',
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        mtoValorUnitario: unitVal,
        mtoValorVenta: unitVal,
        mtoBaseIgv: unitVal,
        porcentajeIgv: 18,
        igv: itemIgv,
        tipAfeIgv: 10,
        totalImpuestos: itemIgv,
        mtoPrecioUnitario: itemTotal,
      };
    }),
    legends: [
      {
        code: '1000',
        value: `SON ${totalSoles.toFixed(2)} SOLES`,
      },
    ],
  };

  try {
    const res = await fetch('https://facturacion.apisperu.com/api/v1/invoice/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    const accepted = Boolean(data?.sunatResponse?.success);
    const hash =
      (typeof data?.hash === 'string' && data.hash) ||
      (typeof data?.sunatResponse?.cdrZip === 'string' ? `CDR-${comprobante.serie}-${comprobante.numero}` : null);
    const msg =
      data?.sunatResponse?.cdrResponse?.description ||
      data?.sunatResponse?.error?.message ||
      data?.message ||
      null;

    if (res.ok) {
      return {
        sent: true,
        estado: accepted ? 'ACEPTADO_SUNAT' : 'ENVIADO_APISPERU',
        hash,
        mensaje: msg ? String(msg) : null,
      };
    }

    return {
      sent: false,
      estado: 'REPRESENTACION_IMPRESA',
      hash: null,
      mensaje: msg ? String(msg) : `Apisperu HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      sent: false,
      estado: 'REPRESENTACION_IMPRESA',
      hash: null,
      mensaje: err instanceof Error ? err.message : 'Error de red enviando a Apisperu',
    };
  }
}

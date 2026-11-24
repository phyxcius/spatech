import React from 'react';
import { BadgeCheck, Download, Printer, Receipt, X } from 'lucide-react';
import {
  formatSoles,
  type ComprobanteElectronico,
  type PedidoNegocio,
  type PedidoPublico,
} from '../types.ts';

interface ElectronicInvoiceModalProps {
  order?: PedidoPublico | PedidoNegocio | null;
  comprobante?: ComprobanteElectronico | null;
  onClose: () => void;
}

export function buildComprobanteFromOrder(
  order: PedidoPublico | PedidoNegocio
): ComprobanteElectronico {
  const tipo =
    order.comprobante_tipo ||
    (order.cliente_documento_tipo === 'RUC' ? 'FACTURA' : 'BOLETA');
  const serie = order.comprobante_serie || (tipo === 'FACTURA' ? 'F001' : 'B001');
  const numero =
    order.comprobante_numero || String(order.id).slice(-8).padStart(8, '0');
  const totalCentavos = Number(order.monto_centavos) || 0;
  const opGravadaCentavos = Math.round(totalCentavos / 1.18);
  const igvCentavos = totalCentavos - opGravadaCentavos;

  const nombreComercial =
    ('negocio_nombre' in order && order.negocio_nombre) ||
    ('prestador_nombre' in order && order.prestador_nombre) ||
    order.emisor_razon_social ||
    'Comercio Verificado Cusco';

  const zonaEmisor =
    order.emisor_direccion ||
    ('negocio_zona' in order && order.negocio_zona) ||
    'Cusco, Perú';

  return {
    tipo,
    serie,
    numero,
    numero_completo: `${serie}-${numero}`,
    emitido_at: order.comprobante_emitido_at || order.created_at,
    pedido_codigo: order.codigo,
    metodo_pago: order.metodo_pago,
    moneda: 'PEN',
    emisor: {
      ruc: order.emisor_ruc || '20601234565',
      razon_social: order.emisor_razon_social || nombreComercial,
      nombre_comercial: nombreComercial,
      direccion: zonaEmisor,
    },
    receptor: {
      tipo_doc: order.cliente_documento_tipo || 'DNI',
      numero_doc: order.cliente_documento_numero || '00000000',
      nombre: order.cliente_nombre,
      direccion: order.cliente_direccion_fiscal || 'Cusco, Perú',
    },
    items: [
      {
        cantidad: 1,
        descripcion: order.item_nombre,
        detalle: order.transcripcion,
        valor_unitario_centavos: opGravadaCentavos,
        total_centavos: totalCentavos,
      },
    ],
    op_gravada_centavos: opGravadaCentavos,
    igv_centavos: igvCentavos,
    total_centavos: totalCentavos,
    hash: order.comprobante_hash ?? null,
    sunat_estado: order.comprobante_sunat_estado ?? null,
  };
}

export const ElectronicInvoiceModal: React.FC<ElectronicInvoiceModalProps> = ({
  order,
  comprobante,
  onClose,
}) => {
  if (order?.categoria === 'TRANSPORTE') return null;
  const data = comprobante || (order ? buildComprobanteFromOrder(order) : null);
  if (!data) return null;

  const isFactura = data.tipo === 'FACTURA';
  const docTitle = isFactura
    ? 'FACTURA ELECTRÓNICA'
    : data.tipo === 'RECIBO'
    ? 'RECIBO DE SERVICIO'
    : 'BOLETA DE VENTA ELECTRÓNICA';

  function handleDownloadHtml() {
    if (!data) return;
    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${docTitle} ${data.numero_completo}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; max-width: 480px; margin: 0 auto; }
  .box { border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; }
  .center { text-align: center; }
  .mono { font-family: ui-monospace, monospace; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 4px; text-align: left; }
  .right { text-align: right; }
  .tot { font-weight: 700; font-size: 16px; }
</style>
</head>
<body>
  <div class="box">
    <div class="center">
      <h2 style="margin:0">${data.emisor.razon_social}</h2>
      <p style="margin:4px 0;font-size:13px">${data.emisor.direccion}</p>
      <p class="mono" style="margin:4px 0;font-weight:700">RUC: ${data.emisor.ruc}</p>
      <hr/>
      <h3 style="margin:8px 0">${docTitle}</h3>
      <p class="mono" style="margin:0;font-size:16px;font-weight:700">${data.numero_completo}</p>
    </div>
    <p style="font-size:13px">
      <strong>Cliente:</strong> ${data.receptor.nombre}<br/>
      <strong>${data.receptor.tipo_doc}:</strong> <span class="mono">${data.receptor.numero_doc}</span><br/>
      <strong>Dirección:</strong> ${data.receptor.direccion}<br/>
      <strong>Pedido:</strong> <span class="mono">${data.pedido_codigo}</span> · <strong>Pago:</strong> ${data.metodo_pago}
    </p>
    <table>
      <thead><tr><th>Cant.</th><th>Descripción</th><th class="right">Importe</th></tr></thead>
      <tbody>
        ${data.items
          .map(
            (it) =>
              `<tr><td>${it.cantidad}</td><td>${it.descripcion}</td><td class="right mono">S/ ${(
                it.total_centavos / 100
              ).toFixed(2)}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>
    <div style="font-size:13px">
      <div style="display:flex;justify-content:space-between"><span>Op. Gravada:</span><span class="mono">S/ ${(data.op_gravada_centavos / 100).toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>IGV (18%):</span><span class="mono">S/ ${(data.igv_centavos / 100).toFixed(2)}</span></div>
      <div class="tot" style="display:flex;justify-content:space-between;margin-top:6px"><span>IMPORTE TOTAL:</span><span class="mono">S/ ${(data.total_centavos / 100).toFixed(2)}</span></div>
    </div>
    <p class="center" style="font-size:11px;color:#64748b;margin-top:16px">Emitido desde Red Multinegocio La Chuspa · Representación impresa SUNAT</p>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.tipo.toLowerCase()}-${data.numero_completo}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comprobante Electrónico"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="chuspa-printable-comprobante"
        className="w-full max-w-md rounded-3xl bg-white text-slate-900 border border-slate-200 shadow-2xl p-6 space-y-5 my-auto"
      >
        {/* Barra superior de cierre (no se imprime) */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 chuspa-no-print">
          <div className="flex items-center gap-2 text-slate-700">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Comprobante Listo para Entregar / Imprimir
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar comprobante"
            className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Encabezado SUNAT Emisor */}
        <div className="text-center space-y-1.5 border-b border-dashed border-slate-300 pb-4">
          <p className="text-base font-bold text-slate-900 leading-snug">
            {data.emisor.razon_social}
          </p>
          {data.emisor.nombre_comercial !== data.emisor.razon_social && (
            <p className="text-xs text-slate-600">{data.emisor.nombre_comercial}</p>
          )}
          <p className="text-xs text-slate-500">{data.emisor.direccion}</p>
          <p className="font-mono-tabular text-xs font-bold text-slate-800">
            R.U.C. {data.emisor.ruc}
          </p>

          <div className="mt-3 rounded-2xl border-2 border-slate-900 px-4 py-2.5 inline-block">
            <p className="text-[11px] font-extrabold tracking-widest text-slate-900">
              {docTitle}
            </p>
            <p className="font-mono-tabular text-lg font-black text-slate-900">
              {data.numero_completo}
            </p>
          </div>
        </div>

        {/* Datos del Receptor (DNI / RUC validado) */}
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-semibold">
              {isFactura ? 'Razón Social / Cliente:' : 'Señor(a):'}
            </span>
            <span className="font-bold text-slate-900 text-right">{data.receptor.nombre}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 font-semibold">{data.receptor.tipo_doc}:</span>
            <span className="font-mono-tabular font-bold text-slate-900 inline-flex items-center gap-1">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
              {data.receptor.numero_doc}
            </span>
          </div>
          {data.receptor.direccion && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-500 font-semibold shrink-0">Dirección:</span>
              <span className="text-slate-700 text-right">{data.receptor.direccion}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
            <span className="text-slate-500">Pedido · Pago:</span>
            <span className="font-mono-tabular text-slate-800">
              {data.pedido_codigo} · {data.metodo_pago}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Fecha emisión:</span>
            <span className="font-mono-tabular text-slate-700">
              {new Date(data.emitido_at).toLocaleString('es-PE')}
            </span>
          </div>
        </div>

        {/* Detalle de Items */}
        <div className="space-y-2">
          <div className="grid grid-cols-12 text-[11px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-200 pb-1.5">
            <span className="col-span-2">Cant.</span>
            <span className="col-span-7">Descripción</span>
            <span className="col-span-3 text-right">Importe</span>
          </div>
          {data.items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 text-xs gap-2 py-1 border-b border-dashed border-slate-200">
              <span className="col-span-2 font-mono-tabular font-semibold">{it.cantidad}</span>
              <div className="col-span-7">
                <p className="font-semibold text-slate-900">{it.descripcion}</p>
                {it.detalle && it.detalle !== it.descripcion && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{it.detalle}</p>
                )}
              </div>
              <span className="col-span-3 font-mono-tabular font-semibold text-right text-slate-900">
                {formatSoles(it.total_centavos)}
              </span>
            </div>
          ))}
        </div>

        {/* Totales IGV 18% */}
        <div className="space-y-1.5 text-xs border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between text-slate-600">
            <span>OP. GRAVADA</span>
            <span className="font-mono-tabular">{formatSoles(data.op_gravada_centavos)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>I.G.V. (18%)</span>
            <span className="font-mono-tabular">{formatSoles(data.igv_centavos)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-slate-300">
            <span>IMPORTE TOTAL</span>
            <span className="font-mono-tabular">{formatSoles(data.total_centavos)}</span>
          </div>
        </div>

        {/* Pie representacion impresa y estado SUNAT (Apisperu) */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-center text-[11px] text-emerald-800 space-y-1">
          <p>
            Representación impresa de {isFactura ? 'Factura' : 'Boleta'} Electrónica · Operación Liquidada
          </p>
          {data.sunat_estado && (
            <p className="font-mono-tabular font-bold text-emerald-700">
              Estado SUNAT (Apisperu): {data.sunat_estado}
              {data.hash ? ` · Hash ${data.hash.slice(0, 14)}…` : ''}
            </p>
          )}
        </div>

        {/* Botones Imprimir / Descargar (no se imprimen) */}
        <div className="flex gap-2.5 pt-1 chuspa-no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 min-h-[46px] rounded-2xl bg-[#14213D] hover:bg-[#1c2d52] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir {isFactura ? 'Factura' : 'Boleta'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="min-h-[46px] px-4 rounded-2xl border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Guardar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

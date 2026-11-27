import React, { useState } from 'react';
import { Building2, Check, Copy, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { formatSoles, type MetodoPago } from '../types.ts';
import { isValidApprovalCode, isValidPeruYapePhone, VITE_MP_PUBLIC_KEY } from '../lib/mercadopago.ts';

export interface NegocioPagoInfo {
  mp_public_key?: string | null;
  mp_yape_configurado?: boolean;
  yape_numero?: string | null;
  plin_numero?: string | null;
  banco_nombre?: string | null;
  banco_titular?: string | null;
  banco_cuenta?: string | null;
  banco_cci?: string | null;
}

interface YapePlinTransferCheckoutBoxProps {
  metodoPago: MetodoPago;
  amountCentavos: number;
  negocioNombre?: string;
  negocioPagoConfig?: NegocioPagoInfo | null;
  phone: string;
  onPhoneChange: (val: string) => void;
  approvalCode: string;
  onApprovalCodeChange: (val: string) => void;
  transferConfirmed?: boolean;
  onTransferConfirmedChange?: (val: boolean) => void;
  compact?: boolean;
}

export const YapePlinTransferCheckoutBox: React.FC<YapePlinTransferCheckoutBoxProps> = ({
  metodoPago,
  amountCentavos,
  negocioNombre,
  negocioPagoConfig,
  phone,
  onPhoneChange,
  approvalCode,
  onApprovalCodeChange,
  transferConfirmed = false,
  onTransferConfirmedChange,
  compact = false,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyText(key: string, value?: string | null) {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  if (metodoPago === 'Efectivo') {
    return (
      <div className="rounded-xl border border-[#D8E2EC] dark:border-white/10 bg-[#F7FAFC] dark:bg-[#041824] px-3 py-2 text-[11px] text-[#516478] dark:text-slate-300">
        Pago en efectivo contra entrega / al finalizar el servicio por{' '}
        <span className="font-bold text-[#0B2538] dark:text-white">{formatSoles(amountCentavos)}</span>.
      </div>
    );
  }

  if (metodoPago === 'Yape' || metodoPago === 'Plin') {
    const cleanPhone = phone.replace(/\D/g, '').slice(0, 9);
    const cleanCode = approvalCode.replace(/\D/g, '').slice(0, 6);
    const phoneOk = isValidPeruYapePhone(cleanPhone);
    const codeOk = isValidApprovalCode(cleanCode);
    const receiverNumber =
      metodoPago === 'Yape'
        ? negocioPagoConfig?.yape_numero || ''
        : negocioPagoConfig?.plin_numero || '';
    const hasMpYapeAuto =
      metodoPago === 'Yape' &&
      Boolean(negocioPagoConfig?.mp_yape_configurado) &&
      Boolean((negocioPagoConfig?.mp_public_key || VITE_MP_PUBLIC_KEY || '').trim());

    return (
      <div
        className={`rounded-2xl border ${
          metodoPago === 'Yape'
            ? 'border-[#742284]/25 bg-[#742284]/[0.04] dark:bg-[#742284]/15'
            : 'border-[#00A8E8]/25 bg-[#00A8E8]/[0.05] dark:bg-[#00A8E8]/15'
        } ${compact ? 'p-3 space-y-2.5' : 'p-3.5 space-y-3'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Smartphone
              className={`w-4 h-4 ${
                metodoPago === 'Yape' ? 'text-[#742284] dark:text-[#E9B8F5]' : 'text-[#0284C7] dark:text-[#7DD3FC]'
              }`}
            />
            <span className="text-xs font-extrabold text-[#0B2538] dark:text-white">
              Pago con {metodoPago} · {formatSoles(amountCentavos)}
            </span>
          </div>
          {hasMpYapeAuto ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
              <ShieldCheck className="w-3 h-3" /> Cobro automático MP
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1565F5]/10 text-[#1565F5] dark:text-[#93C5FD] text-[10px] font-bold">
              <KeyRound className="w-3 h-3" /> Código de aprobación
            </span>
          )}
        </div>

        {receiverNumber && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-white/85 dark:bg-[#041824]/80 border border-[#D8E2EC] dark:border-white/10 px-2.5 py-1.5 text-[11px]">
            <span className="text-[#516478] dark:text-slate-300 truncate">
              {metodoPago} de {negocioNombre || 'comercio'}:{' '}
              <strong className="font-mono-tabular text-[#0B2538] dark:text-white">{receiverNumber}</strong>
            </span>
            <button
              type="button"
              onClick={() => copyText('wallet-num', receiverNumber)}
              className="px-2 py-0.5 rounded-lg bg-[#EBF3FF] dark:bg-[#04334B] text-[#1565F5] dark:text-[#93C5FD] font-semibold flex items-center gap-1 shrink-0"
            >
              {copiedKey === 'wallet-num' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedKey === 'wallet-num' ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-[#516478] dark:text-slate-300 mb-1">
              Celular {metodoPago} (9 dígitos)
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={9}
              value={cleanPhone}
              onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="987654321"
              className={`w-full rounded-xl border px-3 py-2 text-xs font-mono-tabular bg-white dark:bg-[#041824] text-[#0B2538] dark:text-white focus:outline-none ${
                cleanPhone.length === 0
                  ? 'border-[#D8E2EC] dark:border-white/15 focus:border-[#1565F5]'
                  : phoneOk
                  ? 'border-emerald-500'
                  : 'border-amber-500'
              }`}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#516478] dark:text-slate-300 mb-1">
              Código de aprobación (6 dígitos)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={cleanCode}
              onChange={(e) => onApprovalCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className={`w-full rounded-xl border px-3 py-2 text-xs font-mono-tabular tracking-widest bg-white dark:bg-[#041824] text-[#0B2538] dark:text-white focus:outline-none ${
                cleanCode.length === 0
                  ? 'border-[#D8E2EC] dark:border-white/15 focus:border-[#1565F5]'
                  : codeOk
                  ? 'border-emerald-500'
                  : 'border-amber-500'
              }`}
            />
          </div>
        </div>
        <p className="text-[10px] text-[#516478] dark:text-slate-400">
          Obtén tu código de aprobación de 6 dígitos en la app {metodoPago} (Menú → Comprar por internet / Código de aprobación).
        </p>
      </div>
    );
  }

  // metodoPago === 'Tarjeta': mostrar SOLO datos de transferencia bancaria del comercio para aprobar la compra
  const hasBankData = Boolean(
    negocioPagoConfig?.banco_nombre ||
      negocioPagoConfig?.banco_cuenta ||
      negocioPagoConfig?.banco_cci
  );

  return (
    <div className="rounded-2xl border border-[#1565F5]/25 bg-[#EBF3FF]/70 dark:bg-[#04334B]/55 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-[#1565F5] dark:text-[#60A5FA]" />
          <span className="text-xs font-extrabold text-[#0B2538] dark:text-white">
            Datos de Transferencia · {negocioNombre || 'Comercio'}
          </span>
        </div>
        <span className="font-mono-tabular text-xs font-extrabold text-[#1565F5] dark:text-[#F5C400]">
          {formatSoles(amountCentavos)}
        </span>
      </div>

      {hasBankData ? (
        <div className="space-y-1.5 rounded-xl bg-white dark:bg-[#041824] border border-[#D8E2EC] dark:border-white/10 p-2.5 text-[11px]">
          {negocioPagoConfig?.banco_nombre && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#516478] dark:text-slate-400">Banco</span>
              <span className="font-bold text-[#0B2538] dark:text-white">{negocioPagoConfig.banco_nombre}</span>
            </div>
          )}
          {negocioPagoConfig?.banco_titular && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#516478] dark:text-slate-400">Titular</span>
              <span className="font-semibold text-[#0B2538] dark:text-white text-right">{negocioPagoConfig.banco_titular}</span>
            </div>
          )}
          {negocioPagoConfig?.banco_cuenta && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#516478] dark:text-slate-400">N° Cuenta</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono-tabular font-bold text-[#0B2538] dark:text-white">
                  {negocioPagoConfig.banco_cuenta}
                </span>
                <button
                  type="button"
                  onClick={() => copyText('cta', negocioPagoConfig.banco_cuenta)}
                  className="text-[#1565F5] dark:text-[#60A5FA] hover:underline font-semibold flex items-center gap-0.5"
                >
                  {copiedKey === 'cta' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}
          {negocioPagoConfig?.banco_cci && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#516478] dark:text-slate-400">CCI Interbancario</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono-tabular font-bold text-[#0B2538] dark:text-white">
                  {negocioPagoConfig.banco_cci}
                </span>
                <button
                  type="button"
                  onClick={() => copyText('cci', negocioPagoConfig.banco_cci)}
                  className="text-[#1565F5] dark:text-[#60A5FA] hover:underline font-semibold flex items-center gap-0.5"
                >
                  {copiedKey === 'cci' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/10 rounded-xl px-2.5 py-2">
          Este comercio aún no registró su cuenta bancaria / CCI en su panel. Puedes aprobar el pedido y coordinar el abono directo al confirmar.
        </p>
      )}

      {onTransferConfirmedChange && (
        <label className="flex items-start gap-2 cursor-pointer text-[11px] text-[#0B2538] dark:text-slate-200 font-semibold pt-0.5">
          <input
            type="checkbox"
            checked={transferConfirmed}
            onChange={(e) => onTransferConfirmedChange(e.target.checked)}
            className="mt-0.5 accent-[#1565F5] w-4 h-4 rounded shrink-0"
          />
          <span>Confirmo que realicé o aprobaré la transferencia por {formatSoles(amountCentavos)}.</span>
        </label>
      )}
    </div>
  );
};

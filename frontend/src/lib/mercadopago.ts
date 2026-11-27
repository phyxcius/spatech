declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string }
    ) => {
      yape: ((opts?: { otp?: string; phoneNumber?: string }) => {
        create: (payload?: { otp: string; phoneNumber: string }) => Promise<{ id?: string; token?: string }>;
      }) & {
        create?: (payload: { otp: string; phoneNumber: string }) => Promise<{ id?: string; token?: string }>;
      };
    };
  }
}

const ENV_VARS = (import.meta as { env?: Record<string, string | undefined> }).env;
export const VITE_MP_PUBLIC_KEY = (ENV_VARS?.VITE_MP_PUBLIC_KEY || '').trim();

let sdkLoadPromise: Promise<void> | null = null;

export function ensureMercadoPagoSdkLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Mercado Pago SDK solo disponible en navegador.'));
  }
  if (window.MercadoPago) {
    return Promise.resolve();
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="sdk.mercadopago.com/js/v2"]'
    );
    const timeout = window.setTimeout(() => {
      sdkLoadPromise = null;
      reject(new Error('No se pudo cargar Mercado Pago SDK v2. Verifica tu conexión.'));
    }, 8000);

    const onReady = () => {
      if (window.MercadoPago) {
        window.clearTimeout(timeout);
        resolve();
      }
    };

    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      const poll = window.setInterval(() => {
        if (window.MercadoPago) {
          window.clearInterval(poll);
          window.clearTimeout(timeout);
          resolve();
        }
      }, 150);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = onReady;
    script.onerror = () => {
      window.clearTimeout(timeout);
      sdkLoadPromise = null;
      reject(new Error('Error descargando Mercado Pago SDK v2.'));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export async function createMercadoPagoYapeToken(
  publicKey: string,
  phoneNumber: string,
  otp: string
): Promise<string> {
  const cleanKey = (publicKey || VITE_MP_PUBLIC_KEY).trim();
  if (!cleanKey) {
    throw new Error('El comercio aún no configuró su Public Key de Mercado Pago.');
  }
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const cleanOtp = otp.replace(/\D/g, '');
  if (!/^9\d{8}$/.test(cleanPhone)) {
    throw new Error('Ingresa un celular Yape válido de 9 dígitos que empiece en 9.');
  }
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new Error('Ingresa el código de aprobación Yape de exactamente 6 dígitos.');
  }

  await ensureMercadoPagoSdkLoaded();
  const MercadoPagoCtor = window.MercadoPago;
  if (!MercadoPagoCtor) {
    throw new Error('Mercado Pago SDK v2 no inicializado.');
  }

  const mp = new MercadoPagoCtor(cleanKey, { locale: 'es-PE' });
  let res: { id?: string; token?: string } | undefined;

  if (typeof mp.yape?.create === 'function') {
    res = await mp.yape.create({ otp: cleanOtp, phoneNumber: cleanPhone });
  } else if (typeof mp.yape === 'function') {
    const yapeInstance = mp.yape({ otp: cleanOtp, phoneNumber: cleanPhone });
    res = await yapeInstance.create({ otp: cleanOtp, phoneNumber: cleanPhone });
  } else {
    throw new Error('El módulo Yape de Mercado Pago SDK v2 no está disponible.');
  }

  const token = (res?.id || res?.token || '').trim();
  if (!token) {
    throw new Error('Mercado Pago no devolvió un token Yape válido. Verifica el código OTP.');
  }
  return token;
}

export function isValidPeruYapePhone(phone: string): boolean {
  return /^9\d{8}$/.test((phone || '').replace(/\D/g, ''));
}

export function isValidApprovalCode(code: string): boolean {
  return /^\d{6}$/.test((code || '').replace(/\D/g, ''));
}

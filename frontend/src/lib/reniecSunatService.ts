// reniecSunatService.ts
// Sincronización de Tokens en Firebase RTDB (/dev_api.json) + Consulta real DNI (RENIEC) y RUC (SUNAT)

export type ProveedorConsultas = 'auto' | 'apisperu' | 'apisnetpe';

export interface DevApiConfig {
  proveedorConsultas: ProveedorConsultas;
  tokenConsultasDniRuc: string;
  tokenFacturacionApisperu?: string;
}

export interface DniLookupResult {
  success: boolean;
  nombres_completos?: string;
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  fuente?: 'apisperu' | 'apisnetpe';
  message?: string;
}

export interface RucLookupResult {
  success: boolean;
  razon_social?: string;
  direccion?: string;
  estado?: string;
  condicion?: string;
  fuente?: 'apisperu' | 'apisnetpe';
  message?: string;
}

const DEFAULT_RTDB_URL = 'https://spatech-b3edf-default-rtdb.firebaseio.com';
const envRtdbUrl = (
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FIREBASE_RTDB_URL || ''
).trim();

export const DEV_API_FIREBASE_RTDB_URL = /^https?:\/\/[a-z0-9.-]+/i.test(envRtdbUrl)
  ? envRtdbUrl.replace(/\/+$/, '')
  : DEFAULT_RTDB_URL;

const LOCAL_CACHE_KEY = 'dev_api_config_cache';

const DEFAULT_CFG: DevApiConfig = {
  proveedorConsultas: 'auto',
  tokenConsultasDniRuc: '',
  tokenFacturacionApisperu: '',
};

function sanitizeCfg(raw: Partial<DevApiConfig> | null | undefined): DevApiConfig {
  const prov: ProveedorConsultas =
    raw?.proveedorConsultas === 'apisperu' || raw?.proveedorConsultas === 'apisnetpe'
      ? raw.proveedorConsultas
      : 'auto';
  return {
    proveedorConsultas: prov,
    tokenConsultasDniRuc: String(raw?.tokenConsultasDniRuc || '').trim(),
    tokenFacturacionApisperu: String(raw?.tokenFacturacionApisperu || '').trim(),
  };
}

/**
 * Guarda los tokens y proveedor en Firebase RTDB (/dev_api.json) para que
 * todos los dispositivos y paneles de La Chuspa compartan la misma configuración en vivo.
 */
export async function guardarTokenEnFirebase(
  cfg: DevApiConfig,
  firebaseUrl = DEV_API_FIREBASE_RTDB_URL
): Promise<boolean> {
  const clean = sanitizeCfg(cfg);

  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage errors in restricted contexts
  }

  const res = await fetch(`${firebaseUrl.replace(/\/+$/, '')}/dev_api.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...clean,
      updated_at: new Date().toISOString(),
    }),
  });

  return res.ok;
}

/**
 * Lee la configuración actual desde Firebase RTDB (/dev_api.json) o caché local.
 */
export async function leerDevApiConfig(
  firebaseUrl = DEV_API_FIREBASE_RTDB_URL
): Promise<DevApiConfig> {
  let localCfg: DevApiConfig = { ...DEFAULT_CFG };
  try {
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    if (cached) {
      localCfg = sanitizeCfg(JSON.parse(cached));
    }
  } catch {
    // Ignore invalid cache
  }

  try {
    const res = await fetch(`${firebaseUrl.replace(/\/+$/, '')}/dev_api.json`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (res.ok) {
      const remote = await res.json();
      if (remote && typeof remote === 'object') {
        const merged = sanitizeCfg({
          proveedorConsultas: remote.proveedorConsultas ?? localCfg.proveedorConsultas,
          tokenConsultasDniRuc: remote.tokenConsultasDniRuc ?? localCfg.tokenConsultasDniRuc,
          tokenFacturacionApisperu:
            remote.tokenFacturacionApisperu ?? localCfg.tokenFacturacionApisperu,
        });
        try {
          localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(merged));
        } catch {
          // Ignore storage errors
        }
        return merged;
      }
    }
  } catch {
    // Fall back to local cache
  }

  return localCfg;
}

/**
 * Resuelve el token primero desde parámetro, luego caché local y si no existe
 * realiza una lectura directa sin caché a /dev_api.json en Firebase RTDB.
 */
async function resolveTokenConfig(
  overrideToken?: string,
  firebaseUrl = DEV_API_FIREBASE_RTDB_URL
): Promise<{ cfg: DevApiConfig; token: string; cloudError?: string }> {
  let cfg: DevApiConfig = { ...DEFAULT_CFG };

  try {
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    if (cached) {
      cfg = sanitizeCfg(JSON.parse(cached));
    }
  } catch {
    // Ignore storage errors
  }

  let token = (overrideToken ?? cfg.tokenConsultasDniRuc).trim();
  if (token) return { cfg, token };

  try {
    const res = await fetch(`${firebaseUrl.replace(/\/+$/, '')}/dev_api.json`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      return {
        cfg,
        token: '',
        cloudError: 'Firebase rechazó leer /dev_api por reglas de seguridad.',
      };
    }

    if (res.ok) {
      const remote = await res.json();
      if (remote && typeof remote === 'object') {
        cfg = sanitizeCfg(remote);
        token = cfg.tokenConsultasDniRuc.trim();
        try {
          localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cfg));
        } catch {
          // Ignore storage errors
        }
        if (token) {
          return { cfg, token };
        }
      }
    }
  } catch {
    // Network fallback below
  }

  return {
    cfg,
    token: '',
    cloudError:
      'No hay un Token de Consultas DNI/RUC configurado en Modo Desarrollador (/dev_api).',
  };
}

/**
 * Consulta DNI real en RENIEC usando ApisPerú con respaldo automático de Apis.net.pe.
 */
export async function consultarDNI(
  dni: string,
  overrideToken?: string
): Promise<DniLookupResult> {
  const cleanDni = dni.trim();
  if (cleanDni.length !== 8 || !/^\d+$/.test(cleanDni)) {
    return { success: false, message: 'DNI inválido: debe tener 8 dígitos numéricos.' };
  }

  const { cfg, token, cloudError } = await resolveTokenConfig(overrideToken);
  if (!token) {
    return { success: false, message: cloudError || 'Falta el Token de Consultas DNI/RUC.' };
  }

  const errors: string[] = [];

  // 1. ApisPerú
  if (cfg.proveedorConsultas === 'apisperu' || cfg.proveedorConsultas === 'auto') {
    try {
      const url = `https://dniruc.apisperu.com/api/v1/dni/${cleanDni}?token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5500),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false && data.nombres) {
          const nombres_completos = `${data.nombres} ${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
          return {
            success: true,
            nombres_completos,
            nombres: data.nombres,
            apellidoPaterno: data.apellidoPaterno,
            apellidoMaterno: data.apellidoMaterno,
            fuente: 'apisperu',
          };
        }
        errors.push(`ApisPerú: ${data?.message || 'DNI no encontrado.'}`);
      } else {
        errors.push(`ApisPerú HTTP ${res.status}`);
      }
    } catch {
      errors.push('ApisPerú no accesible desde el navegador (CORS o red).');
    }
  }

  // 2. Respaldo Apis.net.pe (v2)
  if (cfg.proveedorConsultas === 'apisnetpe' || cfg.proveedorConsultas === 'auto') {
    try {
      const url = `https://api.apis.net.pe/v2/reniec/dni?numero=${cleanDni}&token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5500),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && (data.nombres || data.nombreCompleto)) {
          const nombres_completos =
            data.nombreCompleto ||
            `${data.nombres || ''} ${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
          return {
            success: true,
            nombres_completos,
            nombres: data.nombres,
            apellidoPaterno: data.apellidoPaterno,
            apellidoMaterno: data.apellidoMaterno,
            fuente: 'apisnetpe',
          };
        }
        errors.push(`Apis.net.pe: ${data?.message || 'DNI no encontrado.'}`);
      } else {
        errors.push(`Apis.net.pe HTTP ${res.status}`);
      }
    } catch {
      errors.push('Apis.net.pe bloqueado por CORS directo o sin conexión.');
    }
  }

  return {
    success: false,
    message: errors.join(' | ') || 'No se pudo validar el DNI contra RENIEC.',
  };
}

/**
 * Consulta RUC real en SUNAT usando ApisPerú con respaldo automático de Apis.net.pe.
 */
export async function consultarRUC(
  ruc: string,
  overrideToken?: string
): Promise<RucLookupResult> {
  const cleanRuc = ruc.trim();
  if (cleanRuc.length !== 11 || !/^\d+$/.test(cleanRuc)) {
    return { success: false, message: 'RUC inválido: debe tener 11 dígitos numéricos.' };
  }

  const { cfg, token, cloudError } = await resolveTokenConfig(overrideToken);
  if (!token) {
    return { success: false, message: cloudError || 'Falta el Token de Consultas DNI/RUC.' };
  }

  const errors: string[] = [];

  // 1. ApisPerú
  if (cfg.proveedorConsultas === 'apisperu' || cfg.proveedorConsultas === 'auto') {
    try {
      const url = `https://dniruc.apisperu.com/api/v1/ruc/${cleanRuc}?token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5500),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false && (data.razonSocial || data.nombre)) {
          return {
            success: true,
            razon_social: data.razonSocial || data.nombre,
            direccion: data.direccion || data.departamento || '',
            estado: data.estado,
            condicion: data.condicion,
            fuente: 'apisperu',
          };
        }
        errors.push(`ApisPerú: ${data?.message || 'RUC no encontrado.'}`);
      } else {
        errors.push(`ApisPerú HTTP ${res.status}`);
      }
    } catch {
      errors.push('ApisPerú RUC no accesible (CORS o red).');
    }
  }

  // 2. Respaldo Apis.net.pe (v2)
  if (cfg.proveedorConsultas === 'apisnetpe' || cfg.proveedorConsultas === 'auto') {
    try {
      const url = `https://api.apis.net.pe/v2/sunat/ruc?numero=${cleanRuc}&token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5500),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && (data.razonSocial || data.nombre)) {
          return {
            success: true,
            razon_social: data.razonSocial || data.nombre,
            direccion: data.direccion || '',
            estado: data.estado,
            condicion: data.condicion,
            fuente: 'apisnetpe',
          };
        }
        errors.push(`Apis.net.pe: ${data?.message || 'RUC no encontrado.'}`);
      } else {
        errors.push(`Apis.net.pe HTTP ${res.status}`);
      }
    } catch {
      errors.push('Apis.net.pe RUC bloqueado por CORS directo o sin conexión.');
    }
  }

  return {
    success: false,
    message: errors.join(' | ') || 'No se pudo validar el RUC en SUNAT.',
  };
}

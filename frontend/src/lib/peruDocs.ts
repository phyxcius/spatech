export interface PeruDocumentLookupResult {
  valid: boolean;
  validado?: boolean;
  tipo: 'DNI' | 'RUC';
  numero: string;
  nombre_completo: string;
  razon_social?: string;
  estado?: string;
  condicion?: string;
  direccion?: string;
  source: 'RENIEC' | 'SUNAT' | 'CACHE' | 'VALIDACION_LOCAL';
  fuente?: string;
}

export function isValidPeruvianDni(raw: string): boolean {
  return /^\d{8}$/.test(raw.trim());
}

export function isValidPeruvianRuc(raw: string): boolean {
  const ruc = raw.trim();
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(ruc[i]) * weights[i];
  }
  const rem = 11 - (sum % 11);
  const check = rem === 10 ? 0 : rem === 11 ? 1 : rem;
  return check === Number(ruc[10]);
}

export function formatPeruLookupError(err: unknown): string;
export function formatPeruLookupError(tipo: 'DNI' | 'RUC', numero: string): string | null;
export function formatPeruLookupError(
  arg1: unknown,
  arg2?: string
): string | null {
  if (typeof arg2 === 'string') {
    const tipo = arg1 === 'RUC' ? 'RUC' : 'DNI';
    const clean = arg2.trim();
    if (tipo === 'DNI' && !isValidPeruvianDni(clean)) {
      return 'El DNI debe tener exactamente 8 dígitos numéricos.';
    }
    if (tipo === 'RUC' && !isValidPeruvianRuc(clean)) {
      return 'El RUC debe tener 11 dígitos válidos según dígito verificador SUNAT (10... o 20...).';
    }
    return null;
  }
  if (arg1 instanceof Error && arg1.message.trim()) {
    return arg1.message;
  }
  if (typeof arg1 === 'string' && arg1.trim()) {
    return arg1;
  }
  return 'No se pudo validar el documento con RENIEC / SUNAT.';
}

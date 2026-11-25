export interface CountryDialOption {
  iso: string;
  flag: string;
  name: string;
  dialCode: string;
  sample: string;
}

export const WHATSAPP_COUNTRIES: CountryDialOption[] = [
  { iso: 'PE', flag: '🇵🇪', name: 'Perú', dialCode: '+51', sample: '984123456' },
  { iso: 'US', flag: '🇺🇸', name: 'Estados Unidos', dialCode: '+1', sample: '3055550199' },
  { iso: 'ES', flag: '🇪🇸', name: 'España', dialCode: '+34', sample: '612345678' },
  { iso: 'AR', flag: '🇦🇷', name: 'Argentina', dialCode: '+54', sample: '91123456789' },
  { iso: 'CL', flag: '🇨🇱', name: 'Chile', dialCode: '+56', sample: '912345678' },
  { iso: 'CO', flag: '🇨🇴', name: 'Colombia', dialCode: '+57', sample: '3101234567' },
  { iso: 'EC', flag: '🇪🇨', name: 'Ecuador', dialCode: '+593', sample: '991234567' },
  { iso: 'BO', flag: '🇧🇴', name: 'Bolivia', dialCode: '+591', sample: '71234567' },
  { iso: 'BR', flag: '🇧🇷', name: 'Brasil', dialCode: '+55', sample: '11912345678' },
  { iso: 'MX', flag: '🇲🇽', name: 'México', dialCode: '+52', sample: '5512345678' },
  { iso: 'CA', flag: '🇨🇦', name: 'Canadá', dialCode: '+1', sample: '4165550199' },
  { iso: 'FR', flag: '🇫🇷', name: 'Francia', dialCode: '+33', sample: '612345678' },
  { iso: 'DE', flag: '🇩🇪', name: 'Alemania', dialCode: '+49', sample: '15123456789' },
  { iso: 'GB', flag: '🇬🇧', name: 'Reino Unido', dialCode: '+44', sample: '7700900123' },
  { iso: 'IT', flag: '🇮🇹', name: 'Italia', dialCode: '+39', sample: '3123456789' },
  { iso: 'CH', flag: '🇨🇭', name: 'Suiza', dialCode: '+41', sample: '791234567' },
  { iso: 'NL', flag: '🇳🇱', name: 'Países Bajos', dialCode: '+31', sample: '612345678' },
  { iso: 'UY', flag: '🇺🇾', name: 'Uruguay', dialCode: '+598', sample: '99123456' },
  { iso: 'PY', flag: '🇵🇾', name: 'Paraguay', dialCode: '+595', sample: '981123456' },
  { iso: 'JP', flag: '🇯🇵', name: 'Japón', dialCode: '+81', sample: '9012345678' },
  { iso: 'AU', flag: '🇦🇺', name: 'Australia', dialCode: '+61', sample: '412345678' },
  { iso: 'KR', flag: '🇰🇷', name: 'Corea del Sur', dialCode: '+82', sample: '1012345678' },
];

export function formatWhatsAppNumber(dialCode: string, rawLocal: string): string {
  const cleanCode = dialCode.startsWith('+') ? dialCode : `+${dialCode.replace(/\D/g, '')}`;
  const digits = rawLocal.replace(/\D/g, '');
  if (!digits) return '';
  const codeDigits = cleanCode.replace(/\D/g, '');
  if (digits.startsWith(codeDigits) && digits.length > codeDigits.length + 5) {
    return `+${digits}`;
  }
  return `${cleanCode}${digits}`;
}

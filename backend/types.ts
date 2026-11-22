export const RUBROS = [
  'TRANSPORTE',
  'TURISMO',
  'HOTEL',
  'RESTAURANTE',
  'FARMACIA',
  'CASA_CAMBIO',
] as const;

export type Rubro = (typeof RUBROS)[number];

export const ESTADOS_PEDIDO = [
  'PENDIENTE_CONFIRMACION',
  'CONFIRMADO_PREPARACION',
  'ENTREGADO_PAGADO',
  'CANCELADO',
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const METODOS_PAGO = ['Yape', 'Plin', 'Efectivo', 'Tarjeta'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const METODOS_RECARGA = ['Yape', 'Plin', 'Transferencia'] as const;
export type MetodoRecarga = (typeof METODOS_RECARGA)[number];

export const TIPOS_LEDGER = [
  'RECARGA',
  'AJUSTE',
  'RETENCION',
  'LIBERACION',
  'COMISION',
  'CREDITO_REFERIDO',
  'INGRESO_PLATAFORMA',
] as const;

export type TipoLedger = (typeof TIPOS_LEDGER)[number];

export interface NegocioRow {
  id: number;
  codigo: string;
  rubro: Rubro;
  nombre: string;
  telefono: string;
  descripcion: string;
  lat: number;
  lng: number;
  zona: string;
  en_linea: number;
  activo: number;
  saldo: number;
  saldo_retenido: number;
  calificacion: number;
  created_at: string;
}

export interface ReglaComisionRow {
  rubro: Rubro;
  porcentaje_plataforma: number;
  porcentaje_referido: number;
  updated_at: string;
}

export interface PedidoRow {
  id: number;
  codigo: string;
  negocio_id: number;
  referido_negocio_id: number | null;
  promotor_codigo: string | null;
  categoria: Rubro;
  servicio_id: number | null;
  unidad_id: number | null;
  item_nombre: string;
  transcripcion: string;
  monto_centavos: number;
  metodo_pago: string;
  estado: EstadoPedido;
  cliente_nombre: string;
  cliente_telefono: string;
  origen_texto: string | null;
  destino_texto: string | null;
  origen_lat: number | null;
  origen_lng: number | null;
  distancia_km: number | null;
  eta_min: number | null;
  fecha_hora_reserva: string | null;
  pin_hash: string;
  pin_salt: string;
  pin_cifrado: string | null;
  intentos_pin: number;
  pin_bloqueado: number;
  comision_plataforma_centavos: number;
  comision_referido_centavos: number;
  comision_retenida_centavos: number;
  contraoferta_centavos: number | null;
  motivo_cancelacion: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

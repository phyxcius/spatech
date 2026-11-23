export type Rubro =
  | 'TRANSPORTE'
  | 'TURISMO'
  | 'HOTEL'
  | 'RESTAURANTE'
  | 'FARMACIA'
  | 'CASA_CAMBIO';

export type EstadoPedido =
  | 'PENDIENTE_CONFIRMACION'
  | 'CONFIRMADO_PREPARACION'
  | 'ENTREGADO_PAGADO'
  | 'CANCELADO';

export type MetodoPago = 'Yape' | 'Plin' | 'Efectivo' | 'Tarjeta';
export type MetodoRecarga = 'Yape' | 'Plin' | 'Transferencia';

export type EstadoRegla = 'ACTIVO' | 'INCUMPLIMIENTO' | 'ESTAFA';
export type EntidadEmergencia = 'SAMU' | 'SERENAZGO' | 'PNP_105' | 'BOMBEROS';

export const SALE_MODALITIES = [
  'Kilo',
  'Arroba',
  'Unidad',
  'Docena',
  'Litro',
  'Caja',
  'Metro',
  'Porción',
  'Servicio',
] as const;

export const BUSINESS_CATEGORIES = [
  'Minimarket / Bodega',
  'Restaurante / Gastronomía',
  'Botica / Farmacia',
  'Taxi / Movilidad',
  'Turismo & Guías',
  'Hotel / Alojamiento',
  'Casa de Cambio',
  'Ferretería / Materiales',
  'Mercado / Agrícola',
  'Tienda Multirubro',
] as const;

export interface DirectorioNegocio {
  id: number;
  codigo: string;
  rubro: Rubro;
  nombre: string;
  descripcion: string;
  zona: string;
  lat: number;
  lng: number;
  en_linea: number;
  calificacion: number;
  tipo_persona?: 'NATURAL' | 'JURIDICA';
  documento_tipo?: 'DNI' | 'RUC';
  documento_numero?: string | null;
  razon_social?: string | null;
  tipo_negocio?: string;
  modalidades_venta?: string;
  estado_regla?: EstadoRegla;
  motivo_estado?: string | null;
}

export interface ServicioCatalogo {
  id: number;
  negocio_id: number;
  categoria: Rubro;
  nombre: string;
  descripcion: string;
  precio_centavos: number;
  duracion_min: number;
  stock: number;
  unidad_medida?: string;
  disponible?: number;
  negocio_nombre?: string;
  zona?: string;
  calificacion?: number;
}

export interface UnidadConductor {
  id: number;
  negocio_id: number;
  conductor_nombre: string;
  placa: string;
  modelo: string;
  color: string;
  tarifa_base_centavos: number;
  tarifa_km_centavos: number;
  calificacion: number;
  lat: number;
  lng: number;
  estado: string;
  certificada: number;
  negocio_nombre?: string;
  zona?: string;
}

export interface ConciergeOpcion {
  tipo: 'TAXI' | 'CATALOGO' | 'DIVISA';
  unidad_id?: number;
  servicio_id?: number;
  negocio_id: number;
  negocio_nombre: string;
  categoria: Rubro;
  titulo: string;
  descripcion: string;
  zona?: string;
  placa?: string;
  modelo?: string;
  conductor_nombre?: string;
  calificacion: number;
  certificada?: boolean;
  distancia_km?: number;
  eta_min: number;
  stock?: number;
  unidad_medida?: string;
  precio_centavos: number;
  tasa_compra?: number;
  tasa_venta?: number;
  moneda_origen?: string;
  mejor_precio: boolean;
  disponible: boolean;
}

export interface PedidoPublico {
  id: number;
  codigo: string;
  negocio_id: number;
  referido_negocio_id: number | null;
  categoria: Rubro;
  item_nombre: string;
  transcripcion: string;
  monto_centavos: number;
  metodo_pago: string;
  estado: EstadoPedido;
  cliente_nombre: string;
  cliente_telefono_masked: string;
  cliente_documento_tipo?: 'DNI' | 'RUC' | null;
  cliente_documento_numero?: string | null;
  cliente_documento_verificado?: number;
  origen_texto?: string | null;
  destino_texto?: string | null;
  distancia_km?: number | null;
  eta_min?: number | null;
  fecha_hora_reserva?: string | null;
  negocio_nombre?: string;
  negocio_zona?: string;
  conductor_nombre?: string;
  placa?: string;
  modelo?: string;
  created_at: string;
}

export interface PedidoNegocio {
  id: number;
  codigo: string;
  negocio_id: number;
  referido_negocio_id: number | null;
  categoria: Rubro;
  item_nombre: string;
  transcripcion: string;
  monto_centavos: number;
  metodo_pago: string;
  estado: EstadoPedido;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_documento_tipo?: 'DNI' | 'RUC' | null;
  cliente_documento_numero?: string | null;
  cliente_documento_verificado?: number;
  origen_texto?: string | null;
  destino_texto?: string | null;
  eta_min?: number | null;
  fecha_hora_reserva?: string | null;
  intentos_pin: number;
  pin_bloqueado: number;
  comision_plataforma_centavos: number;
  comision_referido_centavos: number;
  comision_retenida_centavos: number;
  prestador_nombre?: string;
  referidor_nombre?: string;
  pin_prestador?: string;
  created_at: string;
}

export interface WhatsAppLog {
  id: number;
  canal: string;
  plantilla: string;
  mensaje: string;
  estado: string;
  created_at: string;
}

export const RUBRO_LABELS: Record<Rubro, string> = {
  TRANSPORTE: 'Transporte VIP',
  TURISMO: 'Turismo & Guías',
  RESTAURANTE: 'Alta Gastronomía',
  FARMACIA: 'Botica & Salud',
  HOTEL: 'Hoteles & Suites',
  CASA_CAMBIO: 'Divisas',
};

export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  PENDIENTE_CONFIRMACION: 'Pendiente de confirmación',
  CONFIRMADO_PREPARACION: 'Confirmado en curso',
  ENTREGADO_PAGADO: 'Entregado y liquidado',
  CANCELADO: 'Cancelado',
};

export function formatSoles(centavos: number): string {
  const val = (centavos || 0) / 100;
  return `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

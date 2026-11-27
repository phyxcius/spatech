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
  'Unidad',
  'Kilo (kg)',
  'Gramo (g)',
  'Arroba',
  'Litro (L)',
  'Galón',
  'Metro (m)',
  'Pulgada (in)',
  'Pie (ft)',
  'Grosor (mm)',
  'Metro cúbico (m³)',
  'Cubo',
  'Amperio (A)',
  'Grano',
  'Docena',
  'Caja',
  'Rollo',
  'Saco',
  'Porción',
  'Noche',
  'Hora',
  'Vacante',
  'Paquete',
  'Servicio',
] as const;

export const BUSINESS_CATEGORIES = [
  'Ferretería & Materiales',
  'Minimarket / Bodega',
  'Restaurante / Gastronomía',
  'Botica / Farmacia',
  'Taxi / Movilidad',
  'Hotel / Alojamiento',
  'Turismo & Guías',
  'Piñatería & Eventos',
  'Agencia de Empleos / RRHH',
  'Casa de Cambio',
  'Mercado / Agrícola',
  'Veterinaria / Mascotas',
  'Tienda Multirubro',
] as const;

export interface AiCampoEspecifico {
  key: string;
  label: string;
  tipo: 'text' | 'number' | 'select';
  placeholder: string;
  unidad?: string;
  opciones?: string[];
}

export interface AiModuloOperativo {
  id: string;
  titulo: string;
  descripcion: string;
  tipo_herramienta:
    | 'CALCULADORA_MEDIDAS'
    | 'COTIZADOR_VOLUMEN'
    | 'CHECKIN_CUPO'
    | 'POSTULACIONES'
    | 'COMANDA_COCINA'
    | 'RECETARIO_STOCK'
    | 'INFO';
}

export interface AiCatalogoItemSugerido {
  nombre: string;
  descripcion: string;
  precio_centavos: number;
  unidad_medida: string;
  stock: number;
  duracion_min?: number;
  atributos?: Record<string, string>;
}

export interface AiBusinessPanelSchema {
  rubro_base: Rubro;
  rubro_usuario: string;
  rubro_titulo: string;
  subtitulo_panel: string;
  badge_panel: string;
  tema_color: {
    primaryHex: string;
    accentHex: string;
  };
  terminologia: {
    clienteLabel: string;
    pedidoLabel: string;
    catalogoLabel: string;
    nuevoItemBtn: string;
  };
  unidades_medida: string[];
  campos_especificos: AiCampoEspecifico[];
  modulos_panel: AiModuloOperativo[];
  catalogo_inicial: AiCatalogoItemSugerido[];
  generado_por: 'gemini' | 'ia_estatico';
  updated_at: string;
}

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
  panel_ia?: AiBusinessPanelSchema | null;
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
  atributos?: Record<string, string> | null;
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
  lat?: number;
  lng?: number;
  abierto_ahora?: boolean;
  horario?: string;
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
  cliente_documento_tipo?: 'DNI' | 'RUC' | 'EXTRANJERO' | null;
  cliente_documento_numero?: string | null;
  cliente_documento_verificado?: number;
  cliente_direccion_fiscal?: string | null;
  comprobante_tipo?: 'BOLETA' | 'FACTURA' | 'RECIBO' | null;
  comprobante_serie?: string | null;
  comprobante_numero?: string | null;
  comprobante_emitido_at?: string | null;
  comprobante_hash?: string | null;
  comprobante_sunat_estado?: string | null;
  emisor_ruc?: string | null;
  emisor_razon_social?: string | null;
  emisor_direccion?: string | null;
  origen_texto?: string | null;
  destino_texto?: string | null;
  origen_lat?: number | null;
  origen_lng?: number | null;
  destino_lat?: number | null;
  destino_lng?: number | null;
  conductor_lat?: number | null;
  conductor_lng?: number | null;
  unidad_lat?: number | null;
  unidad_lng?: number | null;
  contraoferta_centavos?: number | null;
  distancia_km?: number | null;
  eta_min?: number | null;
  fecha_hora_reserva?: string | null;
  negocio_nombre?: string;
  negocio_zona?: string;
  conductor_nombre?: string;
  placa?: string;
  modelo?: string;
  pin_validado?: number;
  pin_validado_at?: string | null;
  viaje_etapa?: 'HACIA_PASAJERO' | 'EN_RUTA_DESTINO' | 'LLEGADO_DESTINO' | 'FINALIZADO' | null;
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
  cliente_documento_tipo?: 'DNI' | 'RUC' | 'EXTRANJERO' | null;
  cliente_documento_numero?: string | null;
  cliente_documento_verificado?: number;
  cliente_direccion_fiscal?: string | null;
  comprobante_tipo?: 'BOLETA' | 'FACTURA' | 'RECIBO' | null;
  comprobante_serie?: string | null;
  comprobante_numero?: string | null;
  comprobante_emitido_at?: string | null;
  comprobante_hash?: string | null;
  comprobante_sunat_estado?: string | null;
  emisor_ruc?: string | null;
  emisor_razon_social?: string | null;
  emisor_direccion?: string | null;
  origen_texto?: string | null;
  destino_texto?: string | null;
  origen_lat?: number | null;
  origen_lng?: number | null;
  destino_lat?: number | null;
  destino_lng?: number | null;
  conductor_lat?: number | null;
  conductor_lng?: number | null;
  unidad_id?: number | null;
  unidad_lat?: number | null;
  unidad_lng?: number | null;
  conductor_nombre?: string | null;
  placa?: string | null;
  modelo?: string | null;
  distancia_km?: number | null;
  contraoferta_centavos?: number | null;
  eta_min?: number | null;
  fecha_hora_reserva?: string | null;
  intentos_pin: number;
  pin_bloqueado: number;
  pin_validado?: number;
  pin_validado_at?: string | null;
  viaje_etapa?: 'HACIA_PASAJERO' | 'EN_RUTA_DESTINO' | 'LLEGADO_DESTINO' | 'FINALIZADO' | null;
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

export interface SharedCustomerDoc {
  tipo: 'DNI' | 'RUC' | 'EXTRANJERO';
  numero: string;
  nombre: string;
  direccionFiscal?: string;
  whatsapp?: string;
  paisCodigo?: string;
  paisNombre?: string;
  lat?: number;
  lng?: number;
  gpsVerificado?: boolean;
  verificado: boolean;
  fuente?: string;
}

export interface ComprobanteElectronico {
  tipo: 'BOLETA' | 'FACTURA' | 'RECIBO';
  serie: string;
  numero: string;
  numero_completo: string;
  emitido_at: string;
  pedido_codigo: string;
  metodo_pago: string;
  moneda: string;
  hash?: string | null;
  sunat_estado?: string | null;
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
    detalle?: string;
    valor_unitario_centavos: number;
    total_centavos: number;
  }>;
  op_gravada_centavos: number;
  igv_centavos: number;
  total_centavos: number;
}

export function formatSoles(centavos: number): string {
  const val = (centavos || 0) / 100;
  return `S/ ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

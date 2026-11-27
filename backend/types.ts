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

export const ESTADOS_REGLA = ['ACTIVO', 'INCUMPLIMIENTO', 'ESTAFA'] as const;
export type EstadoRegla = (typeof ESTADOS_REGLA)[number];

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
  horario_apertura?: string;
  horario_cierre?: string;
  abierto_24h?: number;
  metodos_pago_aceptados?: string;
  auto_aceptar_pedidos?: number;
  alerta_voz_activa?: number;
  tarifa_minima_centavos?: number;
  radio_cobertura_km?: number;
  tipo_persona?: 'NATURAL' | 'JURIDICA';
  documento_tipo?: 'DNI' | 'RUC';
  documento_numero?: string | null;
  razon_social?: string | null;
  tipo_negocio?: string;
  modalidades_venta?: string;
  panel_ia_json?: string | null;
  estado_regla?: EstadoRegla;
  motivo_estado?: string | null;
  mp_public_key?: string | null;
  mp_access_token?: string | null;
  yape_numero?: string | null;
  plin_numero?: string | null;
  banco_nombre?: string | null;
  banco_titular?: string | null;
  banco_cuenta?: string | null;
  banco_cci?: string | null;
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
  origen_texto: string | null;
  destino_texto: string | null;
  origen_lat: number | null;
  origen_lng: number | null;
  destino_lat?: number | null;
  destino_lng?: number | null;
  conductor_lat?: number | null;
  conductor_lng?: number | null;
  unidad_lat?: number | null;
  unidad_lng?: number | null;
  distancia_km: number | null;
  eta_min: number | null;
  fecha_hora_reserva: string | null;
  pin_hash: string;
  pin_salt: string;
  pin_cifrado: string | null;
  intentos_pin: number;
  pin_bloqueado: number;
  pin_validado?: number;
  pin_validado_at?: string | null;
  viaje_etapa?: 'HACIA_PASAJERO' | 'EN_RUTA_DESTINO' | 'LLEGADO_DESTINO' | 'FINALIZADO' | null;
  comision_plataforma_centavos: number;
  comision_referido_centavos: number;
  comision_retenida_centavos: number;
  contraoferta_centavos: number | null;
  motivo_cancelacion: string | null;
  pago_gateway?: string | null;
  pago_referencia?: string | null;
  pago_estado?: string | null;
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

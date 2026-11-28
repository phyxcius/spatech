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

export const MACRO_CATEGORIAS_UNIVERSALES = [
  'Construcción y Mantenimiento del Hogar',
  'Textil, Confección y Calzado',
  'Servicios Técnicos y Reparación',
  'Gastronomía y Alimentación',
  'Transporte, Carga y Logística',
  'Comercio, Abastecimiento y Ferretería',
  'Salud, Farmacia y Bienestar',
  'Belleza, Estética y Cuidado Personal',
  'Hotelería, Turismo y Eventos',
  'Agricultura, Jardinería y Veterinaria',
  'Educación, Empleo y Servicios Profesionales',
  'Finanzas y Casa de Cambio',
] as const;

export type OficioTipoTarifa =
  | 'por_hora'
  | 'por_proyecto_cotizacion'
  | 'por_prenda'
  | 'por_servicio_fijo'
  | 'por_dia';

export type OficioTipoDato = 'texto' | 'numero' | 'seleccion' | 'booleano';

export interface OficioAtributoClave {
  clave: string;
  etiqueta: string;
  tipo_dato: OficioTipoDato;
  opciones?: string[];
}

export interface OficioNormalizado {
  oficio_id: string;
  nombre_oficial: string;
  macro_categoria: string;
  sinonimos: string[];
  modalidades_disponibles: string[];
  tipo_tarifa_sugerida: OficioTipoTarifa;
  atributos_clave: OficioAtributoClave[];
  etiquetas_busqueda: string[];
  rubro_base?: Rubro;
  generado_por?: 'semilla_universal' | 'gemini' | 'ia_universal_local';
  uso_count?: number;
}

export const OFICIO_TARIFA_LABELS: Record<OficioTipoTarifa, string> = {
  por_hora: 'Tarifa por hora',
  por_proyecto_cotizacion: 'Por proyecto / cotización',
  por_prenda: 'Por prenda o pieza',
  por_servicio_fijo: 'Tarifa por servicio fijo',
  por_dia: 'Por día / jornal',
};

export const BUSINESS_CATEGORIES = [
  'Ferretería & Materiales',
  'Minimarket / Bodega',
  'Restaurante / Gastronomía',
  'Botica / Farmacia',
  'Taxi / Movilidad',
  'Hotel / Alojamiento',
  'Turismo & Guías',
  'Sastre y Modista / Confección',
  'Gasfitero / Fontanero y Plomería',
  'Pintor de Casas, Fachadas y Acabados',
  'Albañil / Maestro de Obra y Construcción',
  'Electricista Domiciliario e Industrial',
  'Carpintero / Ebanista y Melamina',
  'Cerrajero y Apertura de Puertas / Vehículos',
  'Mecánico Automotriz / Auxilio Vehicular',
  'Soldador / Carpintería Metálica y Rejas',
  'Técnico de Celulares, Laptops y Electrónica',
  'Panadero / Pastelero y Repostería Artesanal',
  'Estibador / Cargador, Flete y Mudanza',
  'Jardinero / Paisajismo y Poda',
  'Barbero / Estilista y Peluquería',
  'Zapatero / Reparación de Calzado y Cuero',
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
  tipo: 'text' | 'number' | 'select' | 'boolean';
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
  macro_categoria?: string;
  oficio_especifico?: string;
  oficio_id?: string;
  sinonimos?: string[];
  tipo_tarifa_sugerida?: OficioTipoTarifa;
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
  macro_categoria?: string;
  oficio_especifico?: string;
  oficio_id?: string | null;
  modalidades_venta?: string;
  panel_ia?: AiBusinessPanelSchema | null;
  estado_regla?: EstadoRegla;
  motivo_estado?: string | null;
  mp_public_key?: string | null;
  mp_yape_configurado?: boolean;
  yape_numero?: string | null;
  plin_numero?: string | null;
  banco_nombre?: string | null;
  banco_titular?: string | null;
  banco_cuenta?: string | null;
  banco_cci?: string | null;
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
  es_negocio?: boolean;
  total_productos?: number;
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
  rubro_estado?: 'EXACTO' | 'NO_ESPECIFICADO' | 'OTRO_RUBRO';
  rubro_etiqueta?: string;
  sector_clave?: string;
  macro_categoria?: string;
  oficio_especifico?: string;
  oficio_id?: string;
  nota_rubro?: string;
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
  pago_gateway?: string | null;
  pago_referencia?: string | null;
  pago_estado?: string | null;
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
  pago_gateway?: string | null;
  pago_referencia?: string | null;
  pago_estado?: string | null;
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

export interface UserAccount {
  id: number;
  wechat_id: string;
  documento_tipo: 'DNI' | 'RUC' | 'EXTRANJERO';
  documento_numero: string;
  nombre: string;
  direccion_fiscal?: string;
  pais_codigo: string;
  pais_nombre: string;
  whatsapp: string;
  whatsapp_masked?: string;
  whatsapp_verificado: boolean;
  idioma: string;
  estado_texto?: string;
  avatar_url?: string;
  notificaciones_activas: boolean;
  mostrar_siempre_arriba: boolean;
  created_at?: string;
}

export interface WeChatMessage {
  id: number;
  conversacion_id: string;
  remitente: 'USER' | 'AGENT' | 'SYSTEM' | 'CONTACT';
  tipo_contenido: 'TEXTO' | 'VOZ' | 'UBICACION' | 'STICKER' | 'OPCIONES' | 'TARJETA';
  texto: string;
  meta?: {
    duracion_seg?: number;
    lat?: number;
    lng?: number;
    sticker?: string;
    categoria?: Rubro;
    modo_resultado?: 'NEGOCIOS' | 'PRODUCTOS';
    rubro_solicitado?: string;
    sin_resultados_exactos?: boolean;
    oficio_normalizado?: OficioNormalizado | null;
    opciones?: ConciergeOpcion[];
    alternativas_otros_rubros?: ConciergeOpcion[];
    cancion_titulo?: string;
    cancion_artista?: string;
    archivo_nombre?: string;
  } | null;
  created_at: string;
}

export type MainWeChatTab = 'CHATS' | 'CONTACTOS' | 'CENTER_HUB' | 'DESCUBRIR' | 'YO';


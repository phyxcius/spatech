import { GoogleGenAI, Type } from '@google/genai';
import type { DatabaseSync } from 'node:sqlite';
import {
  RUBROS,
  type OficioAtributoClave,
  type OficioNormalizado,
  type OficioTipoDato,
  type OficioTipoTarifa,
  type Rubro,
} from './types.ts';

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

export function normalizeOficioText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function slugifyOficioId(raw: string): string {
  const clean = normalizeOficioText(raw)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return clean || 'oficio_personalizado';
}

const VALID_TARIFAS: OficioTipoTarifa[] = [
  'por_hora',
  'por_proyecto_cotizacion',
  'por_prenda',
  'por_servicio_fijo',
  'por_dia',
];

const VALID_DATO_TYPES: OficioTipoDato[] = ['texto', 'numero', 'seleccion', 'booleano'];

export const UNIVERSAL_OFICIOS_SEED: OficioNormalizado[] = [
  {
    oficio_id: 'sastre_modista',
    nombre_oficial: 'Sastre y Modista / Confección',
    macro_categoria: 'Textil, Confección y Calzado',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['sastre', 'sastreria', 'modista', 'costurero', 'costurera', 'confeccionista', 'arreglos de ropa', 'compostura'],
    modalidades_disponibles: ['Por prenda', 'A medida', 'Arreglo express', 'Servicio en taller', 'Recojo a domicilio'],
    tipo_tarifa_sugerida: 'por_prenda',
    atributos_clave: [
      {
        clave: 'tipo_prenda',
        etiqueta: 'Tipo de prenda o trabajo',
        tipo_dato: 'seleccion',
        opciones: ['Terno / Saco', 'Pantalón / Basta', 'Vestido / Falda', 'Uniforme', 'Cortinas / Tapiz'],
      },
      { clave: 'toma_medidas_domicilio', etiqueta: 'Toma medidas a domicilio', tipo_dato: 'booleano' },
      { clave: 'plazo_entrega_dias', etiqueta: 'Plazo de entrega (días)', tipo_dato: 'numero' },
      { clave: 'material_tela', etiqueta: 'Tipo de tela / acabado', tipo_dato: 'texto' },
    ],
    etiquetas_busqueda: ['sastre', 'modista', 'costurera', 'basta', 'terno', 'vestido', 'confeccion', 'ropa', 'sastreria'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'gasfitero_fontanero',
    nombre_oficial: 'Gasfitero / Fontanero y Plomería',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['gasfitero', 'gasfiteria', 'fontanero', 'plomero', 'plomeria', 'instalador sanitario', 'tecnico de agua'],
    modalidades_disponibles: ['A domicilio', 'Emergencia 24h', 'Por punto / instalación', 'Por hora', 'Presupuesto previo'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'tipo_trabajo_sanitario',
        etiqueta: 'Especialidad sanitaria',
        tipo_dato: 'seleccion',
        opciones: ['Fuga de agua / tubería', 'Desatoro de desagüe', 'Instalación de therma', 'Grifería e inodoro', 'Bomba de agua / tanque'],
      },
      { clave: 'incluye_repuestos', etiqueta: 'Puede llevar repuestos básicos', tipo_dato: 'booleano' },
      { clave: 'atencion_emergencia', etiqueta: 'Atención de emergencia inmediata', tipo_dato: 'booleano' },
      { clave: 'diametro_tuberia', etiqueta: 'Diámetro o medida (pulgadas)', tipo_dato: 'texto' },
    ],
    etiquetas_busqueda: ['gasfitero', 'fontanero', 'plomero', 'fuga', 'tuberia', 'desague', 'therma', 'griferia', 'agua'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'pintor_brocha_acabados',
    nombre_oficial: 'Pintor de Casas, Fachadas y Acabados',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['pintor', 'pintura de casas', 'pintor de interiores', 'pintor de fachadas', 'empastado', 'lacado'],
    modalidades_disponibles: ['Por metro cuadrado (m²)', 'Por jornada / día', 'Proyecto completo', 'Con materiales', 'Solo mano de obra'],
    tipo_tarifa_sugerida: 'por_proyecto_cotizacion',
    atributos_clave: [
      {
        clave: 'superficie_pintar',
        etiqueta: 'Tipo de superficie',
        tipo_dato: 'seleccion',
        opciones: ['Interiores (látex/satinado)', 'Fachada exterior', 'Madera / Barniz', 'Metal / Anticorrosivo', 'Empastado y sellado'],
      },
      { clave: 'area_m2', etiqueta: 'Área aproximada (m²)', tipo_dato: 'numero' },
      { clave: 'incluye_pintura', etiqueta: 'Incluye pintura y materiales', tipo_dato: 'booleano' },
      { clave: 'trabajo_altura', etiqueta: 'Requiere andamio o altura', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['pintor', 'pintura', 'empastado', 'fachada', 'latex', 'barniz', 'acabados', 'pared'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'albanil_maestro_obra',
    nombre_oficial: 'Albañil / Maestro de Obra y Construcción',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['albanil', 'albanileria', 'maestro de obra', 'constructor', 'enchapador', 'drywall', 'tarrajeo'],
    modalidades_disponibles: ['Por día / jornal', 'Por metro cuadrado (m²)', 'A todo costo', 'Solo mano de obra', 'Cotización en obra'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      {
        clave: 'especialidad_obra',
        etiqueta: 'Especialidad de construcción',
        tipo_dato: 'seleccion',
        opciones: ['Muros y tarrajeo', 'Enchape cerámica / porcelanato', 'Drywall y tabiquería', 'Techo y losa', 'Remodelación integral'],
      },
      { clave: 'area_obra_m2', etiqueta: 'Metraje estimado (m²)', tipo_dato: 'numero' },
      { clave: 'cuenta_con_herramientas', etiqueta: 'Cuenta con herramientas propias', tipo_dato: 'booleano' },
      { clave: 'con_ayudante', etiqueta: 'Incluye cuadrilla / ayudante', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['albanil', 'maestro de obra', 'construccion', 'tarrajeo', 'enchape', 'ceramica', 'drywall', 'remodelacion'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'electricista_instalador',
    nombre_oficial: 'Electricista Domiciliario e Industrial',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['electricista', 'tecnico electrico', 'instalador electrico', 'pozo a tierra', 'tablero electrico'],
    modalidades_disponibles: ['Por punto', 'Por hora', 'Emergencia 24h', 'A domicilio', 'Proyecto eléctrico'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'tipo_instalacion_electrica',
        etiqueta: 'Trabajo eléctrico',
        tipo_dato: 'seleccion',
        opciones: ['Cortocircuito / Falla urgente', 'Tablero y llaves térmicas', 'Cableado y tomacorrientes', 'Luminarias LED', 'Pozo a tierra / Trifásico'],
      },
      { clave: 'voltaje_trabajo', etiqueta: 'Sistema eléctrico (220V / Trifásico)', tipo_dato: 'texto' },
      { clave: 'certificado_pozo_tierra', etiqueta: 'Emite protocolo / certificado', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['electricista', 'cortocircuito', 'tablero', 'cableado', 'pozo a tierra', 'luminaria', 'electrico'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'carpintero_ebanista',
    nombre_oficial: 'Carpintero / Ebanista y Melamina',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['carpintero', 'carpinteria', 'ebanista', 'armador de melamina', 'muebles a medida', 'puertas de madera'],
    modalidades_disponibles: ['A medida', 'Reparación en domicilio', 'Armado de muebles', 'Cotización por proyecto'],
    tipo_tarifa_sugerida: 'por_proyecto_cotizacion',
    atributos_clave: [
      {
        clave: 'material_carpinteria',
        etiqueta: 'Material principal',
        tipo_dato: 'seleccion',
        opciones: ['Madera sólida (cedro/tornillo)', 'Melamina / MDF', 'Restauración / Barnizado', 'Puertas y marcos', 'Closets y cocina'],
      },
      { clave: 'medidas_referencia', etiqueta: 'Medidas aproximadas (cm/m)', tipo_dato: 'texto' },
      { clave: 'armado_domicilio', etiqueta: 'Armado e instalación en domicilio', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['carpintero', 'ebanista', 'madera', 'melamina', 'muebles', 'puerta', 'closet', 'restauracion'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'cerrajero_24h',
    nombre_oficial: 'Cerrajero y Apertura de Puertas / Vehículos',
    macro_categoria: 'Servicios Técnicos y Reparación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['cerrajero', 'cerrajeria', 'duplicado de llaves', 'apertura de puertas', 'chapas', 'llave con chip'],
    modalidades_disponibles: ['Urgencia a domicilio', 'En taller', 'Duplicado / Programación', 'Cambio de chapa'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'tipo_cerradura',
        etiqueta: 'Tipo de cerradura',
        tipo_dato: 'seleccion',
        opciones: ['Puerta de casa / Cantol', 'Chapa blindada / Multipunto', 'Auto / Llave con chip', 'Caja fuerte'],
      },
      { clave: 'emergencia_24h', etiqueta: 'Disponible 24 horas', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['cerrajero', 'cerrajeria', 'llave', 'chapa', 'puerta', 'apertura', 'candado'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'mecanico_automotriz',
    nombre_oficial: 'Mecánico Automotriz / Auxilio Vehicular',
    macro_categoria: 'Servicios Técnicos y Reparación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['mecanico', 'taller mecanico', 'mecanica automotriz', 'auxilio mecanico', 'electricidad automotriz', 'planchado y pintura'],
    modalidades_disponibles: ['En taller', 'Auxilio en ruta', 'Escaneo computarizado', 'Mantenimiento preventivo'],
    tipo_tarifa_sugerida: 'por_proyecto_cotizacion',
    atributos_clave: [
      {
        clave: 'sistema_vehiculo',
        etiqueta: 'Área del vehículo',
        tipo_dato: 'seleccion',
        opciones: ['Motor y afinamiento', 'Frenos y suspensión', 'Batería y sistema eléctrico', 'Escáner OBD2', 'Auxilio en carretera'],
      },
      { clave: 'auxilio_en_ruta', etiqueta: 'Sale con auxilio en ruta', tipo_dato: 'booleano' },
      { clave: 'marca_vehiculo', etiqueta: 'Marcas o tipo (Auto / SUV / Moto)', tipo_dato: 'texto' },
    ],
    etiquetas_busqueda: ['mecanico', 'taller', 'auto', 'motor', 'frenos', 'bateria', 'auxilio', 'escaner'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'soldador_estructuras',
    nombre_oficial: 'Soldador / Carpintería Metálica y Rejas',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['soldador', 'soldadura', 'estructuras metalicas', 'cerrajeria metalica', 'portones', 'rejas', 'techo metalico'],
    modalidades_disponibles: ['Por proyecto', 'En obra / domicilio', 'En taller', 'Por metro lineal'],
    tipo_tarifa_sugerida: 'por_proyecto_cotizacion',
    atributos_clave: [
      {
        clave: 'tipo_soldadura',
        etiqueta: 'Trabajo metálico',
        tipo_dato: 'seleccion',
        opciones: ['Puertas y portones', 'Rejas y barandas', 'Techos y tijerales', 'Soldadura TIG / MIG / Arco'],
      },
      { clave: 'equipo_portatil', etiqueta: 'Lleva máquina portátil a domicilio', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['soldador', 'soldadura', 'reja', 'porton', 'metal', 'estructura', 'baranda', 'fierro'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'tecnico_celulares',
    nombre_oficial: 'Técnico de Celulares, Laptops y Electrónica',
    macro_categoria: 'Servicios Técnicos y Reparación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['tecnico de celulares', 'reparacion de celulares', 'cambio de pantalla', 'tecnico de laptops', 'servicio tecnico'],
    modalidades_disponibles: ['En laboratorio / tienda', 'Recojo y entrega', 'Diagnóstico express'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'equipo_reparar',
        etiqueta: 'Equipo y falla',
        tipo_dato: 'seleccion',
        opciones: ['Cambio de pantalla / glass', 'Batería y puerto de carga', 'Placa / Mojado', 'Laptop / PC / Formateo'],
      },
      { clave: 'garantia_meses', etiqueta: 'Garantía (meses)', tipo_dato: 'numero' },
      { clave: 'reparacion_mismo_dia', etiqueta: 'Entrega el mismo día', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['celular', 'celulares', 'pantalla', 'bateria', 'laptop', 'tecnico', 'iphone', 'samsung'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'tecnico_refrigeracion',
    nombre_oficial: 'Técnico de Refrigeración y Línea Blanca',
    macro_categoria: 'Servicios Técnicos y Reparación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['tecnico de refrigeracion', 'reparacion de refrigeradoras', 'lavadoras', 'aire acondicionado', 'linea blanca'],
    modalidades_disponibles: ['A domicilio', 'Carga de gas', 'Mantenimiento preventivo'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'electrodomestico',
        etiqueta: 'Equipo a revisar',
        tipo_dato: 'seleccion',
        opciones: ['Refrigeradora / Congeladora', 'Lavadora / Secadora', 'Cocina / Horno', 'Aire acondicionado / Calefactor'],
      },
      { clave: 'visita_domicilio', etiqueta: 'Diagnóstico a domicilio', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['refrigeracion', 'refrigeradora', 'lavadora', 'linea blanca', 'calefactor', 'aire acondicionado'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'panadero_pastelero',
    nombre_oficial: 'Panadero / Pastelero y Repostería Artesanal',
    macro_categoria: 'Gastronomía y Alimentación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['panadero', 'panaderia', 'pastelero', 'pasteleria', 'reposteria', 'tortas', 'pan artesanal'],
    modalidades_disponibles: ['Por unidad / porción', 'Por pedido personalizado', 'Delivery', 'Recojo en local'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'tipo_producto_pan',
        etiqueta: 'Especialidad',
        tipo_dato: 'seleccion',
        opciones: ['Pan artesanal / Chuta', 'Torta personalizada', 'Bocaditos / Catering', 'Pastelería sin gluten / vegana'],
      },
      { clave: 'peso_porciones', etiqueta: 'Porciones o peso', tipo_dato: 'numero' },
      { clave: 'pedido_personalizado', etiqueta: 'Personalización bajo pedido', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['panadero', 'panaderia', 'pastelero', 'pasteleria', 'torta', 'pan', 'chuta', 'bocaditos'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'estibador_mudanza',
    nombre_oficial: 'Estibador / Cargador, Flete y Mudanza',
    macro_categoria: 'Transporte, Carga y Logística',
    rubro_base: 'TRANSPORTE',
    sinonimos: ['estibador', 'cargador', 'mudanza', 'flete', 'acarreo', 'transporte de carga', 'embalaje'],
    modalidades_disponibles: ['Por hora', 'Por viaje / flete', 'Con camión / furgoneta', 'Solo cargadores'],
    tipo_tarifa_sugerida: 'por_hora',
    atributos_clave: [
      {
        clave: 'tipo_carga',
        etiqueta: 'Modalidad de carga',
        tipo_dato: 'seleccion',
        opciones: ['Mudanza completa', 'Carga pesada / Construcción', 'Estiba en mercado / almacén', 'Flete urbano o provincial'],
      },
      { clave: 'numero_estibadores', etiqueta: 'Cantidad de estibadores', tipo_dato: 'numero' },
      { clave: 'incluye_vehiculo', etiqueta: 'Incluye camión / furgoneta', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['estibador', 'cargador', 'mudanza', 'flete', 'acarreo', 'carga', 'camion', 'embalaje'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'jardinero_paisajista',
    nombre_oficial: 'Jardinero / Paisajismo y Poda',
    macro_categoria: 'Agricultura, Jardinería y Veterinaria',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['jardinero', 'jardineria', 'paisajista', 'podador', 'cesped', 'mantenimiento de jardines'],
    modalidades_disponibles: ['Por visita', 'Por metro cuadrado (m²)', 'Mantenimiento mensual'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      {
        clave: 'servicio_jardin',
        etiqueta: 'Servicio requerido',
        tipo_dato: 'seleccion',
        opciones: ['Corte de césped y poda', 'Diseño de jardín / riego', 'Fumigación de plantas', 'Tierra de chacra y abono'],
      },
      { clave: 'lleva_maquinaria', etiqueta: 'Lleva podadora y herramientas', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['jardinero', 'jardineria', 'poda', 'cesped', 'plantas', 'paisajismo', 'jardin'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'fumigador_desinfeccion',
    nombre_oficial: 'Fumigador / Control de Plagas y Desinfección',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['fumigador', 'fumigacion', 'control de plagas', 'desratizacion', 'desinfeccion', 'saneamiento'],
    modalidades_disponibles: ['Por área (m²)', 'Hogares', 'Hoteles y restaurantes', 'Con certificado'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'area_tratar_m2', etiqueta: 'Área a fumigar (m²)', tipo_dato: 'numero' },
      { clave: 'certificado_municipal', etiqueta: 'Emite certificado de saneamiento', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['fumigador', 'fumigacion', 'plagas', 'desinfeccion', 'desratizacion', 'saneamiento'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'estilista_barbero',
    nombre_oficial: 'Barbero / Estilista y Peluquería',
    macro_categoria: 'Belleza, Estética y Cuidado Personal',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['barbero', 'barberia', 'peluquero', 'peluqueria', 'estilista', 'salon de belleza', 'manicure'],
    modalidades_disponibles: ['En salón / local', 'A domicilio / hotel', 'Con cita previa'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'servicio_belleza',
        etiqueta: 'Servicio',
        tipo_dato: 'seleccion',
        opciones: ['Corte y barba', 'Peinado y tinte', 'Manicure / Pedicure', 'Maquillaje de evento'],
      },
      { clave: 'atiende_domicilio', etiqueta: 'Atiende en hotel o domicilio', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['barbero', 'barberia', 'peluquero', 'estilista', 'corte', 'cabello', 'salon', 'belleza'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'zapatero_calzado',
    nombre_oficial: 'Zapatero / Reparación de Calzado y Cuero',
    macro_categoria: 'Textil, Confección y Calzado',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['zapatero', 'zapateria', 'reparacion de calzado', 'cambio de suela', 'talabartero', 'arreglos de mochilas'],
    modalidades_disponibles: ['Por par', 'Por trabajo', 'Entrega en taller', 'Recojo'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      {
        clave: 'trabajo_calzado',
        etiqueta: 'Tipo de reparación',
        tipo_dato: 'seleccion',
        opciones: ['Cambio de suela / taco', 'Costura y pegado de botas trekking', 'Teñido y limpieza de cuero', 'Mochilas y cierres'],
      },
      { clave: 'refuerzo_trekking', etiqueta: 'Suela especial para trekking', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['zapatero', 'zapato', 'calzado', 'bota', 'trekking', 'suela', 'cuero', 'mochila'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'housekeeping_hoteleria',
    nombre_oficial: 'Housekeeping / Ama de Llaves y Camarería Hotelera',
    macro_categoria: 'Hotelería, Turismo y Eventos',
    rubro_base: 'HOTEL',
    sinonimos: ['housekeeping', 'housekeeper', 'ama de llaves', 'camareria', 'camarera', 'cuartelero', 'mucama', 'limpieza de habitaciones'],
    modalidades_disponibles: ['Por turno / día', 'Por habitación', 'Tiempo completo', 'Reemplazo por horas'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      { clave: 'habitaciones_turno', etiqueta: 'Habitaciones por turno', tipo_dato: 'numero' },
      { clave: 'manejo_lenceria', etiqueta: 'Manejo de lencería y lavandería hotelera', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['housekeeping', 'ama de llaves', 'camareria', 'hotel', 'hospedaje', 'habitaciones', 'mucama'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'taxi_movilidad_chofer',
    nombre_oficial: 'Taxi / Chofer Privado y Movilidad Turística',
    macro_categoria: 'Transporte, Carga y Logística',
    rubro_base: 'TRANSPORTE',
    sinonimos: ['taxi', 'chofer', 'conductor', 'movilidad', 'traslado aeropuerto', 'remisse', 'van turistica'],
    modalidades_disponibles: ['Por carrera / ruta', 'Por hora', 'Full day Valle Sagrado', 'Traslado aeropuerto'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'capacidad_pasajeros', etiqueta: 'Capacidad de pasajeros', tipo_dato: 'numero' },
      { clave: 'vehiculo_certificado', etiqueta: 'Unidad certificada GPS', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['taxi', 'chofer', 'movilidad', 'aeropuerto', 'terminal', 'traslado', 'van'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'ferreteria_materiales',
    nombre_oficial: 'Ferretería y Materiales de Construcción',
    macro_categoria: 'Comercio, Abastecimiento y Ferretería',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['ferreteria', 'materiales de construccion', 'pinturas', 'herramientas', 'tubos y accesorios'],
    modalidades_disponibles: ['Unidad', 'Kilo (kg)', 'Metro (m)', 'Pulgada (in)', 'Caja', 'Saco', 'Galón', 'Delivery'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'medida_nominal', etiqueta: 'Medida o calibre', tipo_dato: 'texto' },
      { clave: 'despacho_obra', etiqueta: 'Despacho directo a obra', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['ferreteria', 'clavos', 'cemento', 'tubo', 'herramientas', 'pintura', 'construccion'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'farmacia_botica',
    nombre_oficial: 'Botica / Farmacia y Salud',
    macro_categoria: 'Salud, Farmacia y Bienestar',
    rubro_base: 'FARMACIA',
    sinonimos: ['farmacia', 'botica', 'drogueria', 'medicamentos', 'oxigeno medicinal', 'soroche'],
    modalidades_disponibles: ['Delivery 24h', 'Recojo en botica', 'Atención farmacéutica'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'atencion_24h', etiqueta: 'Atención de turno 24h', tipo_dato: 'booleano' },
      { clave: 'requiere_receta', etiqueta: 'Requiere receta médica', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['farmacia', 'botica', 'pastillas', 'soroche', 'oxigeno', 'medicina', 'salud'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'restaurante_gastronomia',
    nombre_oficial: 'Restaurante, Comedor y Gastronomía',
    macro_categoria: 'Gastronomía y Alimentación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['restaurante', 'polleria', 'cevichería', 'pizzeria', 'cafeteria', 'comedor', 'catering'],
    modalidades_disponibles: ['Porción / Plato', 'Reserva de mesa', 'Delivery', 'Para llevar'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'tipo_cocina', etiqueta: 'Especialidad gastronómica', tipo_dato: 'texto' },
      { clave: 'opcion_vegetariana', etiqueta: 'Opciones vegetarianas / sin gluten', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['restaurante', 'comida', 'ceviche', 'trucha', 'pollo', 'almuerzo', 'cena', 'gastronomia'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'hotel_alojamiento',
    nombre_oficial: 'Hotel, Hostal y Alojamiento Turístico',
    macro_categoria: 'Hotelería, Turismo y Eventos',
    rubro_base: 'HOTEL',
    sinonimos: ['hotel', 'hostal', 'hospedaje', 'alojamiento', 'lodge', 'posada', 'suite oxigenada'],
    modalidades_disponibles: ['Por noche', 'Day-use', 'Reserva anticipada'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      { clave: 'huespedes', etiqueta: 'Capacidad de huéspedes', tipo_dato: 'numero' },
      { clave: 'habitacion_oxigenada', etiqueta: 'Habitación oxigenada', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['hotel', 'hostal', 'hospedaje', 'alojamiento', 'habitacion', 'suite', 'noche'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'turismo_guias',
    nombre_oficial: 'Guía Oficial de Turismo y Agencia de Viajes',
    macro_categoria: 'Hotelería, Turismo y Eventos',
    rubro_base: 'TURISMO',
    sinonimos: ['guia de turismo', 'agencia de viajes', 'tour operador', 'turismo', 'machu picchu', 'valle sagrado'],
    modalidades_disponibles: ['Tour privado', 'Grupal', 'Full day', 'Half day'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      { clave: 'idiomas', etiqueta: 'Idiomas disponibles', tipo_dato: 'texto' },
      { clave: 'carne_mincetur', etiqueta: 'Guía certificado MINCETUR', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['turismo', 'guia', 'tour', 'machu picchu', 'valle sagrado', 'maras', 'moray', 'excursion'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'veterinaria_mascotas',
    nombre_oficial: 'Veterinaria, Grooming y PetShop',
    macro_categoria: 'Agricultura, Jardinería y Veterinaria',
    rubro_base: 'FARMACIA',
    sinonimos: ['veterinaria', 'veterinario', 'petshop', 'baño de mascotas', 'grooming', 'clinica veterinaria'],
    modalidades_disponibles: ['Consulta en clínica', 'A domicilio', 'Baño y peluquería', 'Emergencia 24h'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'especie_mascota', etiqueta: 'Especie (Perro / Gato / Otros)', tipo_dato: 'texto' },
      { clave: 'urgencias_24h', etiqueta: 'Atiende urgencias 24h', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['veterinaria', 'veterinario', 'mascota', 'perro', 'gato', 'vacuna', 'petshop'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'contador_asesoria',
    nombre_oficial: 'Contador, Trámites SUNAT y Asesoría Legal',
    macro_categoria: 'Educación, Empleo y Servicios Profesionales',
    rubro_base: 'TURISMO',
    sinonimos: ['contador', 'contabilidad', 'asesor tributario', 'sunat', 'abogado', 'tramites'],
    modalidades_disponibles: ['Por consulta', 'Mensualidad PYME', 'Presencial / Remoto'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'regimen_tributario', etiqueta: 'Régimen (NRUS / RER / MYPE)', tipo_dato: 'texto' },
      { clave: 'atencion_remota', etiqueta: 'Atención virtual por videollamada', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['contador', 'sunat', 'ruc', 'contabilidad', 'abogado', 'tramite', 'asesoria'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'agencia_empleos_rrhh',
    nombre_oficial: 'Agencia de Empleos, Talento y Reclutamiento',
    macro_categoria: 'Educación, Empleo y Servicios Profesionales',
    rubro_base: 'TURISMO',
    sinonimos: ['agencia de empleos', 'bolsa de trabajo', 'rrhh', 'reclutamiento', 'personal calificado'],
    modalidades_disponibles: ['Por vacante', 'Evaluación de candidatos', 'Por jornada'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'sector_vacante', etiqueta: 'Sector laboral', tipo_dato: 'texto' },
      { clave: 'verificacion_antecedentes', etiqueta: 'Incluye verificación de antecedentes', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['empleo', 'empleos', 'vacante', 'trabajo', 'rrhh', 'personal', 'reclutamiento'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'casa_cambio_divisas',
    nombre_oficial: 'Casa de Cambio y Divisas Autorizada',
    macro_categoria: 'Finanzas y Casa de Cambio',
    rubro_base: 'CASA_CAMBIO',
    sinonimos: ['casa de cambio', 'cambista', 'cambio de dolares', 'divisas', 'euros'],
    modalidades_disponibles: ['Ventanilla autorizada', 'Reserva de tasa', 'Transferencia bancaria'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'monedas', etiqueta: 'Monedas operadas (USD / EUR)', tipo_dato: 'texto' },
      { clave: 'emite_comprobante', etiqueta: 'Emite boleta de cambio SBS', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['casa de cambio', 'dolar', 'dolares', 'euro', 'divisas', 'cambista'],
    generado_por: 'semilla_universal',
  },
];

export function inferMacroAndRubroFromText(raw: string): {
  macro_categoria: string;
  rubro_base: Rubro;
  tipo_tarifa_sugerida: OficioTipoTarifa;
} {
  const q = normalizeOficioText(raw);

  if (/(taxi|chofer|repartidor|courier|moto|flete|estibador|cargador|mudanza|transporte|camion)/.test(q)) {
    return {
      macro_categoria: 'Transporte, Carga y Logística',
      rubro_base: 'TRANSPORTE',
      tipo_tarifa_sugerida: /(estibador|cargador|mudanza)/.test(q) ? 'por_hora' : 'por_servicio_fijo',
    };
  }
  if (/(sastre|modista|costur|textil|bordador|tejedor|zapater|calzado|cuero|tapicero|lavanderia)/.test(q)) {
    return {
      macro_categoria: 'Textil, Confección y Calzado',
      rubro_base: 'RESTAURANTE',
      tipo_tarifa_sugerida: /(sastre|modista|costur|bordador|lavanderia)/.test(q) ? 'por_prenda' : 'por_servicio_fijo',
    };
  }
  if (/(gasfiter|fontan|plomer|pintor|albanil|maestro de obra|electric|carpinter|ebanist|soldador|vidrier|drywall|cerraj|fumig|tech|remodel)/.test(q)) {
    return {
      macro_categoria: 'Construcción y Mantenimiento del Hogar',
      rubro_base: 'RESTAURANTE',
      tipo_tarifa_sugerida: /(albanil|jardin)/.test(q)
        ? 'por_dia'
        : /(pintor|carpinter|soldador|remodel|drywall)/.test(q)
          ? 'por_proyecto_cotizacion'
          : 'por_servicio_fijo',
    };
  }
  if (/(mecanico|celular|laptop|comput|refriger|lavadora|electrodomest|reloj|bicicleta|moto|impresora|tecnico|afinador|reparacion)/.test(q)) {
    return {
      macro_categoria: 'Servicios Técnicos y Reparación',
      rubro_base: 'RESTAURANTE',
      tipo_tarifa_sugerida: 'por_servicio_fijo',
    };
  }
  if (/(panader|pasteler|repost|cocin|chef|restaurant|poller|cevich|cafeter|juguer|catering|chocolat|helad)/.test(q)) {
    return {
      macro_categoria: 'Gastronomía y Alimentación',
      rubro_base: 'RESTAURANTE',
      tipo_tarifa_sugerida: 'por_servicio_fijo',
    };
  }
  if (/(farmacia|botica|enfermer|fisioterap|nutricion|odontolog|medico|psicolog|podolog|masaj|acupunt)/.test(q)) {
    return {
      macro_categoria: 'Salud, Farmacia y Bienestar',
      rubro_base: 'FARMACIA',
      tipo_tarifa_sugerida: 'por_servicio_fijo',
    };
  }
  if (/(barber|peluquer|estilist|manicur|pedicur|maquill|cosmetolog|depilac|spa)/.test(q)) {
    return {
      macro_categoria: 'Belleza, Estética y Cuidado Personal',
      rubro_base: 'RESTAURANTE',
      tipo_tarifa_sugerida: 'por_servicio_fijo',
    };
  }
  if (/(hotel|hostal|hospedaje|housekeeping|ama de llaves|turismo|guia|evento|fotograf|dj|animador|pinater)/.test(q)) {
    return {
      macro_categoria: 'Hotelería, Turismo y Eventos',
      rubro_base: /(hotel|hostal|hospedaje|housekeeping|ama de llaves)/.test(q) ? 'HOTEL' : 'TURISMO',
      tipo_tarifa_sugerida: 'por_dia',
    };
  }
  if (/(jardin|paisaj|agricol|agro|ganad|veterinar|apicult|florer|vivero)/.test(q)) {
    return {
      macro_categoria: 'Agricultura, Jardinería y Veterinaria',
      rubro_base: /(veterinar)/.test(q) ? 'FARMACIA' : 'RESTAURANTE',
      tipo_tarifa_sugerida: 'por_dia',
    };
  }
  if (/(dolar|divisa|casa de cambio|cambista|finan)/.test(q)) {
    return {
      macro_categoria: 'Finanzas y Casa de Cambio',
      rubro_base: 'CASA_CAMBIO',
      tipo_tarifa_sugerida: 'por_servicio_fijo',
    };
  }
  if (/(ferreter|bodega|minimarket|abarrotes|librer|tienda)/.test(q)) {
    return {
      macro_categoria: 'Comercio, Abastecimiento y Ferretería',
      rubro_base: 'RESTAURANTE',
      tipo_tarifa_sugerida: 'por_servicio_fijo',
    };
  }
  return {
    macro_categoria: 'Educación, Empleo y Servicios Profesionales',
    rubro_base: 'TURISMO',
    tipo_tarifa_sugerida: /(profesor|tutor|traductor|clases)/.test(q) ? 'por_hora' : 'por_servicio_fijo',
  };
}

export function buildUniversalOficioFallback(rawQuery: string): OficioNormalizado {
  const cleanName = rawQuery.trim().slice(0, 90) || 'Oficio General';
  const norm = normalizeOficioText(cleanName);
  const { macro_categoria, rubro_base, tipo_tarifa_sugerida } = inferMacroAndRubroFromText(cleanName);
  const tokens = norm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const titleName = cleanName
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

  const isTapicero = /(tapicer|tapiz)/.test(norm);
  const isAfinador = /(afinador|piano|instrumento)/.test(norm);

  const atributos_clave: OficioAtributoClave[] = isTapicero
    ? [
        {
          clave: 'tipo_mueble',
          etiqueta: 'Tipo de mueble o tapiz',
          tipo_dato: 'seleccion',
          opciones: ['Sofá / Sillón', 'Sillas de comedor', 'Asientos de auto', 'Cabecera de cama'],
        },
        { clave: 'incluye_espuma_tela', etiqueta: 'Incluye espuma y tela nueva', tipo_dato: 'booleano' },
        { clave: 'cantidad_piezas', etiqueta: 'Cantidad de piezas', tipo_dato: 'numero' },
      ]
    : isAfinador
      ? [
          {
            clave: 'tipo_instrumento',
            etiqueta: 'Tipo de instrumento',
            tipo_dato: 'seleccion',
            opciones: ['Piano vertical', 'Piano de cola', 'Teclado / Órgano', 'Cuerda / Viento'],
          },
          { clave: 'visita_domicilio', etiqueta: 'Servicio a domicilio', tipo_dato: 'booleano' },
        ]
      : [
          {
            clave: 'alcance_servicio',
            etiqueta: 'Alcance o especialidad del trabajo',
            tipo_dato: 'texto',
          },
          {
            clave: 'modalidad_atencion',
            etiqueta: 'Lugar de atención',
            tipo_dato: 'seleccion',
            opciones: ['A domicilio', 'En taller / local', 'Virtual / Remoto', 'En obra'],
          },
          {
            clave: 'incluye_materiales',
            etiqueta: 'Incluye materiales o insumos',
            tipo_dato: 'booleano',
          },
          {
            clave: 'tiempo_estimado_horas',
            etiqueta: 'Tiempo estimado (horas)',
            tipo_dato: 'numero',
          },
        ];

  return {
    oficio_id: slugifyOficioId(cleanName),
    nombre_oficial: titleName,
    macro_categoria,
    rubro_base,
    sinonimos: Array.from(new Set([norm, cleanName.toLowerCase(), ...tokens])).slice(0, 8),
    modalidades_disponibles: [
      'A domicilio',
      'En taller / local',
      'Por cotización previa',
      'Servicio express',
    ],
    tipo_tarifa_sugerida,
    atributos_clave,
    etiquetas_busqueda: Array.from(new Set([norm, ...tokens, slugifyOficioId(cleanName).replace(/_/g, ' ')])).slice(0, 12),
    generado_por: 'ia_universal_local',
    uso_count: 1,
  };
}

function rowToOficio(row: Record<string, unknown>): OficioNormalizado {
  const safeArr = (raw: unknown): string[] => {
    try {
      const parsed = JSON.parse(String(raw || '[]'));
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  let attrs: OficioAtributoClave[] = [];
  try {
    const parsed = JSON.parse(String(row.atributos_clave_json || '[]'));
    if (Array.isArray(parsed)) {
      attrs = parsed
        .filter((a) => a && typeof a === 'object')
        .map((a: any) => ({
          clave: slugifyOficioId(String(a.clave || 'detalle')),
          etiqueta: String(a.etiqueta || 'Detalle').slice(0, 80),
          tipo_dato: VALID_DATO_TYPES.includes(a.tipo_dato) ? a.tipo_dato : 'texto',
          ...(Array.isArray(a.opciones) && a.opciones.length > 0
            ? { opciones: a.opciones.map(String).slice(0, 12) }
            : {}),
        }));
    }
  } catch {
    attrs = [];
  }

  const rawTarifa = String(row.tipo_tarifa_sugerida || 'por_servicio_fijo') as OficioTipoTarifa;
  return {
    oficio_id: String(row.oficio_id || ''),
    nombre_oficial: String(row.nombre_oficial || ''),
    macro_categoria: String(row.macro_categoria || 'Educación, Empleo y Servicios Profesionales'),
    rubro_base: RUBROS.includes(row.rubro_base as Rubro) ? (row.rubro_base as Rubro) : 'RESTAURANTE',
    sinonimos: safeArr(row.sinonimos_json),
    modalidades_disponibles: safeArr(row.modalidades_json),
    tipo_tarifa_sugerida: VALID_TARIFAS.includes(rawTarifa) ? rawTarifa : 'por_servicio_fijo',
    atributos_clave: attrs,
    etiquetas_busqueda: safeArr(row.etiquetas_busqueda_json),
    generado_por: (row.generado_por as OficioNormalizado['generado_por']) || 'semilla_universal',
    uso_count: Number(row.uso_count || 0),
  };
}

export function ensureUniversalOficiosCatalog(db: DatabaseSync): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO oficios_catalogo (
      oficio_id, nombre_oficial, macro_categoria, rubro_base,
      sinonimos_json, modalidades_json, tipo_tarifa_sugerida,
      atributos_clave_json, etiquetas_busqueda_json, generado_por, uso_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const item of UNIVERSAL_OFICIOS_SEED) {
    stmt.run(
      item.oficio_id,
      item.nombre_oficial,
      item.macro_categoria,
      item.rubro_base || 'RESTAURANTE',
      JSON.stringify(item.sinonimos),
      JSON.stringify(item.modalidades_disponibles),
      item.tipo_tarifa_sugerida,
      JSON.stringify(item.atributos_clave),
      JSON.stringify(item.etiquetas_busqueda),
      item.generado_por || 'semilla_universal'
    );
  }
}

export function listAllOficiosCatalog(db: DatabaseSync): OficioNormalizado[] {
  const rows = db
    .prepare('SELECT * FROM oficios_catalogo ORDER BY uso_count DESC, nombre_oficial ASC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(rowToOficio);
}

export function upsertOficioCatalogo(
  db: DatabaseSync,
  oficio: OficioNormalizado,
  generadoPor?: OficioNormalizado['generado_por']
): OficioNormalizado {
  const cleanId = slugifyOficioId(oficio.oficio_id || oficio.nombre_oficial);
  const rubroBase: Rubro = RUBROS.includes(oficio.rubro_base as Rubro)
    ? (oficio.rubro_base as Rubro)
    : inferMacroAndRubroFromText(`${oficio.nombre_oficial} ${oficio.macro_categoria}`).rubro_base;
  const tarifa: OficioTipoTarifa = VALID_TARIFAS.includes(oficio.tipo_tarifa_sugerida)
    ? oficio.tipo_tarifa_sugerida
    : 'por_servicio_fijo';

  db.prepare(`
    INSERT INTO oficios_catalogo (
      oficio_id, nombre_oficial, macro_categoria, rubro_base,
      sinonimos_json, modalidades_json, tipo_tarifa_sugerida,
      atributos_clave_json, etiquetas_busqueda_json, generado_por, uso_count, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(oficio_id) DO UPDATE SET
      nombre_oficial = excluded.nombre_oficial,
      macro_categoria = excluded.macro_categoria,
      rubro_base = excluded.rubro_base,
      sinonimos_json = excluded.sinonimos_json,
      modalidades_json = excluded.modalidades_json,
      tipo_tarifa_sugerida = excluded.tipo_tarifa_sugerida,
      atributos_clave_json = excluded.atributos_clave_json,
      etiquetas_busqueda_json = excluded.etiquetas_busqueda_json,
      uso_count = oficios_catalogo.uso_count + 1,
      updated_at = datetime('now')
  `).run(
    cleanId,
    oficio.nombre_oficial.trim().slice(0, 100),
    oficio.macro_categoria.trim().slice(0, 100),
    rubroBase,
    JSON.stringify(oficio.sinonimos.slice(0, 16)),
    JSON.stringify(oficio.modalidades_disponibles.slice(0, 12)),
    tarifa,
    JSON.stringify(oficio.atributos_clave.slice(0, 8)),
    JSON.stringify(oficio.etiquetas_busqueda.slice(0, 20)),
    generadoPor || oficio.generado_por || 'ia_universal_local'
  );

  const saved = db
    .prepare('SELECT * FROM oficios_catalogo WHERE oficio_id = ?')
    .get(cleanId) as Record<string, unknown>;
  return rowToOficio(saved);
}

export function findExactOrSynonymOficio(
  db: DatabaseSync,
  rawQuery: string
): OficioNormalizado | null {
  const q = normalizeOficioText(rawQuery);
  if (!q || q.length < 2) return null;
  const qSlug = slugifyOficioId(q);
  const all = listAllOficiosCatalog(db);

  for (const item of all) {
    if (item.oficio_id === qSlug || normalizeOficioText(item.nombre_oficial) === q) {
      return item;
    }
    if (item.sinonimos.some((s) => normalizeOficioText(s) === q)) {
      return item;
    }
  }

  // Coincidencia por inclusión de sinónimo o nombre clave de oficio (>= 4 letras) dentro de una consulta natural
  const words = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4);
  for (const item of all) {
    const terms = [
      normalizeOficioText(item.nombre_oficial),
      ...item.sinonimos.map(normalizeOficioText),
    ].filter((t) => t.length >= 4);
    for (const term of terms) {
      if (q.includes(term) && (words.includes(term) || term.includes(' '))) {
        return item;
      }
    }
  }
  return null;
}

export function searchOficiosCatalog(
  db: DatabaseSync,
  rawQuery: string
): { oficios: OficioNormalizado[]; exact_match: OficioNormalizado | null } {
  const all = listAllOficiosCatalog(db);
  const q = normalizeOficioText(rawQuery);
  if (!q) {
    return { oficios: all, exact_match: null };
  }
  const exact = findExactOrSynonymOficio(db, rawQuery);
  const tokens = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
  const matched = all.filter((item) => {
    const hay = normalizeOficioText(
      `${item.oficio_id} ${item.nombre_oficial} ${item.macro_categoria} ${item.sinonimos.join(' ')} ${item.etiquetas_busqueda.join(' ')}`
    );
    if (hay.includes(q)) return true;
    return tokens.length > 0 && tokens.every((t) => hay.includes(t));
  });
  return { oficios: matched, exact_match: exact };
}

export async function normalizeOficioWithAi(
  db: DatabaseSync,
  rawQuery: string
): Promise<{
  oficio: OficioNormalizado;
  created: boolean;
  ai_used: boolean;
  ai_error: string | null;
}> {
  const clean = rawQuery.trim().slice(0, 120);
  const existing = findExactOrSynonymOficio(db, clean);
  if (existing) {
    db.prepare("UPDATE oficios_catalogo SET uso_count = uso_count + 1, updated_at = datetime('now') WHERE oficio_id = ?").run(
      existing.oficio_id
    );
    return { oficio: existing, created: false, ai_used: false, ai_error: null };
  }

  let aiUsed = false;
  let aiError: string | null = null;
  let normalized: OficioNormalizado | null = null;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && clean.length >= 2) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Usuario ingresó el oficio, profesión o servicio: "${clean}"`,
        config: {
          systemInstruction: [
            'Eres el Normalizador y Creador Automático de Oficios y Empleos de La Chuspa.',
            'Cuando un usuario o negocio escriba un oficio, empleo o servicio en lenguaje natural (ej: "quiero un maestro que arregle caños", "necesito costurera para basta de pantalón", "soy tapicero de muebles", "afinador de pianos"), haz lo siguiente:',
            '1) Normaliza la consulta a un oficio oficial estándar en español.',
            '2) Si no existe en la lista base, créalo dinámicamente con su macro_categoria.',
            '3) Incluye sinónimos regionales de Perú y Latinoamérica (ej: gasfitero = fontanero / plomero; sastre = modista / costurera).',
            '4) Define tipo_tarifa_sugerida EXACTAMENTE como uno de: por_hora, por_proyecto_cotizacion, por_prenda, por_servicio_fijo, por_dia.',
            '5) Define atributos_clave con tipo_dato EXACTAMENTE uno de: texto, numero, seleccion, booleano.',
            '6) Nunca respondas "ese oficio no está en la lista"; siempre clasifícalo y estructúralo.',
          ].join('\n'),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              oficio_id: { type: Type.STRING },
              nombre_oficial: { type: Type.STRING },
              macro_categoria: { type: Type.STRING },
              rubro_base: { type: Type.STRING },
              sinonimos: { type: Type.ARRAY, items: { type: Type.STRING } },
              modalidades_disponibles: { type: Type.ARRAY, items: { type: Type.STRING } },
              tipo_tarifa_sugerida: { type: Type.STRING },
              atributos_clave: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    clave: { type: Type.STRING },
                    etiqueta: { type: Type.STRING },
                    tipo_dato: { type: Type.STRING },
                    opciones: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['clave', 'etiqueta', 'tipo_dato'],
                },
              },
              etiquetas_busqueda: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'oficio_id',
              'nombre_oficial',
              'macro_categoria',
              'sinonimos',
              'modalidades_disponibles',
              'tipo_tarifa_sugerida',
              'atributos_clave',
              'etiquetas_busqueda',
            ],
          },
        },
      });
      const parsed = JSON.parse((response.text || '{}').trim()) as Record<string, any>;
      if (parsed && typeof parsed.nombre_oficial === 'string' && parsed.nombre_oficial.trim()) {
        const inferred = inferMacroAndRubroFromText(
          `${parsed.nombre_oficial} ${parsed.macro_categoria || ''}`
        );
        const rawTarifa = String(parsed.tipo_tarifa_sugerida || '') as OficioTipoTarifa;
        const attrs: OficioAtributoClave[] = Array.isArray(parsed.atributos_clave)
          ? parsed.atributos_clave.slice(0, 6).map((a: any, idx: number) => ({
              clave: slugifyOficioId(String(a?.clave || `campo_${idx + 1}`)),
              etiqueta: String(a?.etiqueta || `Especificación ${idx + 1}`).slice(0, 80),
              tipo_dato: VALID_DATO_TYPES.includes(a?.tipo_dato) ? a.tipo_dato : 'texto',
              ...(Array.isArray(a?.opciones) && a.opciones.length > 0
                ? { opciones: a.opciones.map(String).slice(0, 10) }
                : {}),
            }))
          : [];
        normalized = {
          oficio_id: slugifyOficioId(String(parsed.oficio_id || parsed.nombre_oficial)),
          nombre_oficial: String(parsed.nombre_oficial).trim().slice(0, 100),
          macro_categoria:
            typeof parsed.macro_categoria === 'string' && parsed.macro_categoria.trim()
              ? parsed.macro_categoria.trim().slice(0, 100)
              : inferred.macro_categoria,
          rubro_base: RUBROS.includes(parsed.rubro_base as Rubro)
            ? (parsed.rubro_base as Rubro)
            : inferred.rubro_base,
          sinonimos: Array.isArray(parsed.sinonimos)
            ? parsed.sinonimos.map(String).filter(Boolean).slice(0, 12)
            : [clean.toLowerCase()],
          modalidades_disponibles: Array.isArray(parsed.modalidades_disponibles)
            ? parsed.modalidades_disponibles.map(String).filter(Boolean).slice(0, 10)
            : ['A domicilio', 'En taller'],
          tipo_tarifa_sugerida: VALID_TARIFAS.includes(rawTarifa)
            ? rawTarifa
            : inferred.tipo_tarifa_sugerida,
          atributos_clave: attrs,
          etiquetas_busqueda: Array.isArray(parsed.etiquetas_busqueda)
            ? parsed.etiquetas_busqueda.map(String).filter(Boolean).slice(0, 16)
            : [clean.toLowerCase()],
          generado_por: 'gemini',
        };
        aiUsed = true;
      }
    } catch (err) {
      aiError = err instanceof Error ? err.message : 'Error consultando Gemini';
    }
  }

  if (!normalized) {
    normalized = buildUniversalOficioFallback(clean);
  }

  const saved = upsertOficioCatalogo(
    db,
    normalized,
    aiUsed ? 'gemini' : 'ia_universal_local'
  );
  return {
    oficio: saved,
    created: true,
    ai_used: aiUsed,
    ai_error: aiError,
  };
}

import type {
  AiCampoEspecifico,
  OficioAtributoClave,
  OficioNormalizado,
  OficioTipoTarifa,
  Rubro,
} from '../types.ts';

export function normalizeOficioClient(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function slugifyOficioClient(raw: string): string {
  return (
    normalizeOficioClient(raw)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'oficio_personalizado'
  );
}

export const UNIVERSAL_OFICIOS_CLIENT_SEED: OficioNormalizado[] = [
  {
    oficio_id: 'sastre_modista',
    nombre_oficial: 'Sastre y Modista / Confección',
    macro_categoria: 'Textil, Confección y Calzado',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['sastre', 'modista', 'costurero', 'costurera', 'confeccionista', 'sastreria', 'arreglos de ropa'],
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
    etiquetas_busqueda: ['sastre', 'modista', 'costurera', 'basta', 'terno', 'vestido', 'confeccion'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'gasfitero_fontanero',
    nombre_oficial: 'Gasfitero / Fontanero y Plomería',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['gasfitero', 'gasfiteria', 'fontanero', 'plomero', 'plomeria', 'instalador sanitario'],
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
    etiquetas_busqueda: ['gasfitero', 'fontanero', 'plomero', 'fuga', 'tuberia', 'desague', 'therma'],
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
    etiquetas_busqueda: ['pintor', 'pintura', 'empastado', 'fachada', 'latex', 'barniz', 'acabados'],
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
    etiquetas_busqueda: ['albanil', 'maestro de obra', 'construccion', 'tarrajeo', 'enchape', 'ceramica', 'drywall'],
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
    etiquetas_busqueda: ['electricista', 'cortocircuito', 'tablero', 'cableado', 'pozo a tierra', 'luminaria'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'carpintero_ebanista',
    nombre_oficial: 'Carpintero / Ebanista y Melamina',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['carpintero', 'carpinteria', 'ebanista', 'armador de melamina', 'muebles a medida'],
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
    etiquetas_busqueda: ['carpintero', 'ebanista', 'madera', 'melamina', 'muebles', 'puerta', 'closet'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'cerrajero_24h',
    nombre_oficial: 'Cerrajero y Apertura de Puertas / Vehículos',
    macro_categoria: 'Servicios Técnicos y Reparación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['cerrajero', 'cerrajeria', 'duplicado de llaves', 'apertura de puertas', 'chapas'],
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
    etiquetas_busqueda: ['cerrajero', 'cerrajeria', 'llave', 'chapa', 'puerta', 'apertura'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'mecanico_automotriz',
    nombre_oficial: 'Mecánico Automotriz / Auxilio Vehicular',
    macro_categoria: 'Servicios Técnicos y Reparación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['mecanico', 'taller mecanico', 'mecanica automotriz', 'auxilio mecanico'],
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
    etiquetas_busqueda: ['mecanico', 'taller', 'auto', 'motor', 'frenos', 'bateria', 'auxilio'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'soldador_estructuras',
    nombre_oficial: 'Soldador / Carpintería Metálica y Rejas',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['soldador', 'soldadura', 'estructuras metalicas', 'cerrajeria metalica', 'portones', 'rejas'],
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
    etiquetas_busqueda: ['soldador', 'soldadura', 'reja', 'porton', 'metal', 'estructura', 'baranda'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'tecnico_celulares',
    nombre_oficial: 'Técnico de Celulares, Laptops y Electrónica',
    macro_categoria: 'Servicios Técnicos y Reparación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['tecnico de celulares', 'reparacion de celulares', 'cambio de pantalla', 'tecnico de laptops'],
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
    etiquetas_busqueda: ['celular', 'celulares', 'pantalla', 'bateria', 'laptop', 'tecnico'],
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
    etiquetas_busqueda: ['refrigeracion', 'refrigeradora', 'lavadora', 'linea blanca', 'calefactor'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'panadero_pastelero',
    nombre_oficial: 'Panadero / Pastelero y Repostería Artesanal',
    macro_categoria: 'Gastronomía y Alimentación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['panadero', 'panaderia', 'pastelero', 'pasteleria', 'reposteria', 'tortas'],
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
    etiquetas_busqueda: ['panadero', 'panaderia', 'pastelero', 'pasteleria', 'torta', 'pan', 'chuta'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'estibador_mudanza',
    nombre_oficial: 'Estibador / Cargador, Flete y Mudanza',
    macro_categoria: 'Transporte, Carga y Logística',
    rubro_base: 'TRANSPORTE',
    sinonimos: ['estibador', 'cargador', 'mudanza', 'flete', 'acarreo', 'transporte de carga'],
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
    etiquetas_busqueda: ['estibador', 'cargador', 'mudanza', 'flete', 'acarreo', 'carga'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'jardinero_paisajista',
    nombre_oficial: 'Jardinero / Paisajismo y Poda',
    macro_categoria: 'Agricultura, Jardinería y Veterinaria',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['jardinero', 'jardineria', 'paisajista', 'podador', 'cesped'],
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
    etiquetas_busqueda: ['jardinero', 'jardineria', 'poda', 'cesped', 'plantas', 'paisajismo'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'fumigador_desinfeccion',
    nombre_oficial: 'Fumigador / Control de Plagas y Desinfección',
    macro_categoria: 'Construcción y Mantenimiento del Hogar',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['fumigador', 'fumigacion', 'control de plagas', 'desratizacion', 'desinfeccion'],
    modalidades_disponibles: ['Por área (m²)', 'Hogares', 'Hoteles y restaurantes', 'Con certificado'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'area_tratar_m2', etiqueta: 'Área a fumigar (m²)', tipo_dato: 'numero' },
      { clave: 'certificado_municipal', etiqueta: 'Emite certificado de saneamiento', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['fumigador', 'fumigacion', 'plagas', 'desinfeccion', 'desratizacion'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'estilista_barbero',
    nombre_oficial: 'Barbero / Estilista y Peluquería',
    macro_categoria: 'Belleza, Estética y Cuidado Personal',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['barbero', 'barberia', 'peluquero', 'peluqueria', 'estilista', 'salon de belleza'],
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
    etiquetas_busqueda: ['barbero', 'barberia', 'peluquero', 'estilista', 'corte', 'cabello'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'zapatero_calzado',
    nombre_oficial: 'Zapatero / Reparación de Calzado y Cuero',
    macro_categoria: 'Textil, Confección y Calzado',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['zapatero', 'zapateria', 'reparacion de calzado', 'cambio de suela', 'talabartero'],
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
    etiquetas_busqueda: ['zapatero', 'zapato', 'calzado', 'bota', 'trekking', 'suela', 'cuero'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'housekeeping_hoteleria',
    nombre_oficial: 'Housekeeping / Ama de Llaves y Camarería Hotelera',
    macro_categoria: 'Hotelería, Turismo y Eventos',
    rubro_base: 'HOTEL',
    sinonimos: ['housekeeping', 'housekeeper', 'ama de llaves', 'camareria', 'camarera', 'cuartelero', 'mucama'],
    modalidades_disponibles: ['Por turno / día', 'Por habitación', 'Tiempo completo', 'Reemplazo por horas'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      { clave: 'habitaciones_turno', etiqueta: 'Habitaciones por turno', tipo_dato: 'numero' },
      { clave: 'manejo_lenceria', etiqueta: 'Manejo de lencería y lavandería hotelera', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['housekeeping', 'ama de llaves', 'camareria', 'hotel', 'hospedaje', 'habitaciones'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'ferreteria_materiales',
    nombre_oficial: 'Ferretería y Materiales de Construcción',
    macro_categoria: 'Comercio, Abastecimiento y Ferretería',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['ferreteria', 'materiales de construccion', 'pinturas', 'herramientas'],
    modalidades_disponibles: ['Unidad', 'Kilo (kg)', 'Metro (m)', 'Pulgada (in)', 'Caja', 'Saco', 'Galón', 'Delivery'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'medida_nominal', etiqueta: 'Medida o calibre', tipo_dato: 'texto' },
      { clave: 'despacho_obra', etiqueta: 'Despacho directo a obra', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['ferreteria', 'clavos', 'cemento', 'tubo', 'herramientas', 'pintura'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'farmacia_botica',
    nombre_oficial: 'Botica / Farmacia y Salud',
    macro_categoria: 'Salud, Farmacia y Bienestar',
    rubro_base: 'FARMACIA',
    sinonimos: ['farmacia', 'botica', 'drogueria', 'medicamentos', 'oxigeno medicinal'],
    modalidades_disponibles: ['Delivery 24h', 'Recojo en botica', 'Atención farmacéutica'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'atencion_24h', etiqueta: 'Atención de turno 24h', tipo_dato: 'booleano' },
      { clave: 'requiere_receta', etiqueta: 'Requiere receta médica', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['farmacia', 'botica', 'pastillas', 'soroche', 'oxigeno', 'medicina'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'restaurante_gastronomia',
    nombre_oficial: 'Restaurante, Comedor y Gastronomía',
    macro_categoria: 'Gastronomía y Alimentación',
    rubro_base: 'RESTAURANTE',
    sinonimos: ['restaurante', 'polleria', 'cevicheria', 'pizzeria', 'cafeteria', 'comedor'],
    modalidades_disponibles: ['Porción / Plato', 'Reserva de mesa', 'Delivery', 'Para llevar'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'tipo_cocina', etiqueta: 'Especialidad gastronómica', tipo_dato: 'texto' },
      { clave: 'opcion_vegetariana', etiqueta: 'Opciones vegetarianas / sin gluten', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['restaurante', 'comida', 'ceviche', 'trucha', 'pollo', 'almuerzo', 'cena'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'hotel_alojamiento',
    nombre_oficial: 'Hotel, Hostal y Alojamiento Turístico',
    macro_categoria: 'Hotelería, Turismo y Eventos',
    rubro_base: 'HOTEL',
    sinonimos: ['hotel', 'hostal', 'hospedaje', 'alojamiento', 'lodge', 'posada'],
    modalidades_disponibles: ['Por noche', 'Day-use', 'Reserva anticipada'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      { clave: 'huespedes', etiqueta: 'Capacidad de huéspedes', tipo_dato: 'numero' },
      { clave: 'habitacion_oxigenada', etiqueta: 'Habitación oxigenada', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['hotel', 'hostal', 'hospedaje', 'alojamiento', 'habitacion', 'suite'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'turismo_guias',
    nombre_oficial: 'Guía Oficial de Turismo y Agencia de Viajes',
    macro_categoria: 'Hotelería, Turismo y Eventos',
    rubro_base: 'TURISMO',
    sinonimos: ['guia de turismo', 'agencia de viajes', 'tour operador', 'turismo', 'machu picchu'],
    modalidades_disponibles: ['Tour privado', 'Grupal', 'Full day', 'Half day'],
    tipo_tarifa_sugerida: 'por_dia',
    atributos_clave: [
      { clave: 'idiomas', etiqueta: 'Idiomas disponibles', tipo_dato: 'texto' },
      { clave: 'carne_mincetur', etiqueta: 'Guía certificado MINCETUR', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['turismo', 'guia', 'tour', 'machu picchu', 'valle sagrado', 'maras'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'taxi_movilidad_chofer',
    nombre_oficial: 'Taxi / Chofer Privado y Movilidad Turística',
    macro_categoria: 'Transporte, Carga y Logística',
    rubro_base: 'TRANSPORTE',
    sinonimos: ['taxi', 'chofer', 'conductor', 'movilidad', 'traslado aeropuerto'],
    modalidades_disponibles: ['Por carrera / ruta', 'Por hora', 'Full day Valle Sagrado', 'Traslado aeropuerto'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'capacidad_pasajeros', etiqueta: 'Capacidad de pasajeros', tipo_dato: 'numero' },
      { clave: 'vehiculo_certificado', etiqueta: 'Unidad certificada GPS', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['taxi', 'chofer', 'movilidad', 'aeropuerto', 'terminal', 'traslado'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'veterinaria_mascotas',
    nombre_oficial: 'Veterinaria, Grooming y PetShop',
    macro_categoria: 'Agricultura, Jardinería y Veterinaria',
    rubro_base: 'FARMACIA',
    sinonimos: ['veterinaria', 'veterinario', 'petshop', 'grooming', 'clinica veterinaria'],
    modalidades_disponibles: ['Consulta en clínica', 'A domicilio', 'Baño y peluquería', 'Emergencia 24h'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'especie_mascota', etiqueta: 'Especie (Perro / Gato / Otros)', tipo_dato: 'texto' },
      { clave: 'urgencias_24h', etiqueta: 'Atiende urgencias 24h', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['veterinaria', 'veterinario', 'mascota', 'perro', 'gato', 'petshop'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'agencia_empleos_rrhh',
    nombre_oficial: 'Agencia de Empleos, Talento y Reclutamiento',
    macro_categoria: 'Educación, Empleo y Servicios Profesionales',
    rubro_base: 'TURISMO',
    sinonimos: ['agencia de empleos', 'bolsa de trabajo', 'rrhh', 'reclutamiento'],
    modalidades_disponibles: ['Por vacante', 'Evaluación de candidatos', 'Por jornada'],
    tipo_tarifa_sugerida: 'por_servicio_fijo',
    atributos_clave: [
      { clave: 'sector_vacante', etiqueta: 'Sector laboral', tipo_dato: 'texto' },
      { clave: 'verificacion_antecedentes', etiqueta: 'Incluye verificación de antecedentes', tipo_dato: 'booleano' },
    ],
    etiquetas_busqueda: ['empleo', 'empleos', 'vacante', 'trabajo', 'rrhh', 'reclutamiento'],
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
    etiquetas_busqueda: ['contador', 'sunat', 'ruc', 'contabilidad', 'abogado', 'tramite'],
    generado_por: 'semilla_universal',
  },
  {
    oficio_id: 'casa_cambio_divisas',
    nombre_oficial: 'Casa de Cambio y Divisas Autorizada',
    macro_categoria: 'Finanzas y Casa de Cambio',
    rubro_base: 'CASA_CAMBIO',
    sinonimos: ['casa de cambio', 'cambista', 'cambio de dolares', 'divisas'],
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

export function inferMacroAndRubroClient(raw: string): {
  macro_categoria: string;
  rubro_base: Rubro;
  tipo_tarifa_sugerida: OficioTipoTarifa;
} {
  const q = normalizeOficioClient(raw);
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

export function buildUniversalOficioClientFallback(rawQuery: string): OficioNormalizado {
  const cleanName = rawQuery.trim().slice(0, 90) || 'Oficio General';
  const norm = normalizeOficioClient(cleanName);
  const { macro_categoria, rubro_base, tipo_tarifa_sugerida } = inferMacroAndRubroClient(cleanName);
  const tokens = norm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  const titleName = cleanName
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

  return {
    oficio_id: slugifyOficioClient(cleanName),
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
    atributos_clave: [
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
    ],
    etiquetas_busqueda: Array.from(new Set([norm, ...tokens, slugifyOficioClient(cleanName).replace(/_/g, ' ')])).slice(0, 12),
    generado_por: 'ia_universal_local',
    uso_count: 1,
  };
}

export function findExactOrSynonymOficioClient(
  rawQuery: string,
  catalog: OficioNormalizado[] = UNIVERSAL_OFICIOS_CLIENT_SEED
): OficioNormalizado | null {
  const q = normalizeOficioClient(rawQuery);
  if (!q || q.length < 2) return null;
  const qSlug = slugifyOficioClient(q);

  for (const item of catalog) {
    if (item.oficio_id === qSlug || normalizeOficioClient(item.nombre_oficial) === q) {
      return item;
    }
    if (item.sinonimos.some((s) => normalizeOficioClient(s) === q)) {
      return item;
    }
  }

  const words = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4);
  for (const item of catalog) {
    const terms = [
      normalizeOficioClient(item.nombre_oficial),
      ...item.sinonimos.map(normalizeOficioClient),
    ].filter((t) => t.length >= 4);
    for (const term of terms) {
      if (q.includes(term) && (words.includes(term) || term.includes(' '))) {
        return item;
      }
    }
  }
  return null;
}

export function searchOficiosLocal(
  rawQuery: string,
  catalog: OficioNormalizado[] = UNIVERSAL_OFICIOS_CLIENT_SEED
): { oficios: OficioNormalizado[]; exact_match: OficioNormalizado | null } {
  const q = normalizeOficioClient(rawQuery);
  if (!q) {
    return { oficios: catalog, exact_match: null };
  }
  const exact = findExactOrSynonymOficioClient(rawQuery, catalog);
  const tokens = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
  const matched = catalog.filter((item) => {
    const hay = normalizeOficioClient(
      `${item.oficio_id} ${item.nombre_oficial} ${item.macro_categoria} ${item.sinonimos.join(' ')} ${item.etiquetas_busqueda.join(' ')}`
    );
    if (hay.includes(q)) return true;
    return tokens.length > 0 && tokens.every((t) => hay.includes(t));
  });
  return { oficios: matched, exact_match: exact };
}

export function mapOficioAtributosToCampos(atributos: OficioAtributoClave[]): AiCampoEspecifico[] {
  return atributos.map((a) => ({
    key: a.clave,
    label: a.etiqueta,
    tipo:
      a.tipo_dato === 'numero'
        ? 'number'
        : a.tipo_dato === 'seleccion'
          ? 'select'
          : a.tipo_dato === 'booleano'
            ? 'boolean'
            : 'text',
    placeholder: a.etiqueta,
    ...(Array.isArray(a.opciones) && a.opciones.length > 0 ? { opciones: a.opciones } : {}),
  }));
}

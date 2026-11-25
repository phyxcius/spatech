import type { AiBusinessPanelSchema, Rubro } from '../types.ts';

function normalize(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function buildClientFallbackPanelForRubro(params: {
  rubro_usuario: string;
  nombre?: string;
  descripcion?: string;
  rubro_base_hint?: Rubro;
}): AiBusinessPanelSchema {
  const rawInput = params.rubro_usuario.trim() || 'Comercio Multirubro';
  const q = normalize(rawInput);
  const now = new Date().toISOString();

  if (
    /(ferreteria|construccion|materiales|clavo|tornillo|electricidad|pintura|plomeria|carpinteria|soldadura|maquinaria)/.test(
      q
    )
  ) {
    return {
      rubro_base: 'RESTAURANTE',
      rubro_usuario: rawInput,
      rubro_titulo: 'Ferretería Industrial & Materiales de Construcción',
      subtitulo_panel:
        'Control técnico por peso, longitud, grosor, volumen (m³/cubo), amperaje y grano con emisión SUNAT.',
      badge_panel: 'Panel IA · Ferretería & Ingeniería',
      tema_color: { primaryHex: '#D97706', accentHex: '#2563EB' },
      terminologia: {
        clienteLabel: 'Maestro / Empresa',
        pedidoLabel: 'Cotización / Despacho',
        catalogoLabel: 'Ferretería & Stock Técnico',
        nuevoItemBtn: 'Agregar Material / Herramienta',
      },
      unidades_medida: [
        'Unidad',
        'Kilo (kg)',
        'Gramo (g)',
        'Litro (L)',
        'Galón',
        'Metro (m)',
        'Pulgada (in)',
        'Pie (ft)',
        'Grosor (mm)',
        'Longitud',
        'Volumen',
        'Metro cúbico (m³)',
        'Cubo',
        'Amperio (A)',
        'Grano',
        'Caja',
        'Rollo',
        'Saco',
      ],
      campos_especificos: [
        {
          key: 'longitud_medida',
          label: 'Longitud / Medida',
          tipo: 'text',
          placeholder: 'Ej: 3 pulgadas / 6 metros / 12 pies',
          unidad: 'm / in / ft',
        },
        {
          key: 'grosor_calibre',
          label: 'Grosor / Calibre',
          tipo: 'text',
          placeholder: 'Ej: 2.5 mm / 1/2 pulgada / AWG 12',
          unidad: 'mm / in',
        },
        {
          key: 'amperaje_capacidad',
          label: 'Amperios / Volumen / Peso',
          tipo: 'text',
          placeholder: 'Ej: 20 A / 500 g / 4 litros / 1 m³',
        },
        {
          key: 'grano_material',
          label: 'Grano / Material',
          tipo: 'select',
          placeholder: 'Selecciona material o grano',
          opciones: [
            'Acero galvanizado',
            'Cobre electrolítico',
            'PVC / Polietileno',
            'Grano 80 (grueso)',
            'Grano 120 (medio)',
            'Grano 220 (fino)',
            'Agregado / Concreto',
          ],
        },
      ],
      modulos_panel: [
        {
          id: 'calc_medidas',
          titulo: 'Conversor Técnico (Metros ↔ Pulgadas ↔ Pies & Kilos ↔ Gramos)',
          descripcion:
            'Convierte al instante longitudes y pesos para despachar clavos, tornillos, cables y tuberías sin errores.',
          tipo_herramienta: 'CALCULADORA_MEDIDAS',
        },
        {
          id: 'cot_volumen',
          titulo: 'Cubicación & Volumen (m³ / Cubos / Litros / Amperios)',
          descripcion:
            'Calcula metros cúbicos de agregados, litros de pintura o carga en amperios para tableros.',
          tipo_herramienta: 'COTIZADOR_VOLUMEN',
        },
      ],
      catalogo_inicial: [
        {
          nombre: 'Clavos de Acero con Cabeza 3" (Kilo)',
          descripcion: 'Clavos de construcción alta resistencia para encofrado y carpintería.',
          precio_centavos: 950,
          unidad_medida: 'Kilo (kg)',
          stock: 180,
          duracion_min: 15,
          atributos: {
            longitud_medida: '3 pulgadas (76 mm)',
            grosor_calibre: '3.4 mm (BWG 10)',
            grano_material: 'Acero galvanizado',
          },
        },
        {
          nombre: 'Tornillo Autoperforante Hexagonal 1/4" x 2"',
          descripcion: 'Venta fraccionada por gramos o caja de 100 unidades para estructura metálica.',
          precio_centavos: 1800,
          unidad_medida: 'Gramo (g)',
          stock: 250,
          duracion_min: 15,
          atributos: {
            longitud_medida: '2 pulgadas',
            grosor_calibre: '1/4 pulgada (6.3 mm)',
            amperaje_capacidad: '500 gramos por bolsa',
            grano_material: 'Acero galvanizado',
          },
        },
        {
          nombre: 'Llave Termomagnética 2x32 Amperios + Cable N°12',
          descripcion: 'Interruptor riel DIN certificado 32A con tramo de conductor THW 100% cobre.',
          precio_centavos: 4800,
          unidad_medida: 'Amperio (A)',
          stock: 45,
          duracion_min: 20,
          atributos: {
            longitud_medida: '10 metros de cable',
            grosor_calibre: 'AWG 12 (3.31 mm²)',
            amperaje_capacidad: '32 Amperios (A) · 220V',
            grano_material: 'Cobre electrolítico',
          },
        },
        {
          nombre: 'Lija de Fierro / Madera Grano 120 (Pliego)',
          descripcion: 'Abrasivo de óxido de aluminio para acabado fino en metal o madera.',
          precio_centavos: 350,
          unidad_medida: 'Grano',
          stock: 300,
          duracion_min: 10,
          atributos: {
            longitud_medida: '9 x 11 pulgadas',
            grano_material: 'Grano 120 (medio)',
          },
        },
        {
          nombre: 'Arena Fina Lavada / Hormigón (Metro Cúbico)',
          descripcion: 'Despacho directo a obra por metro cúbico (m³) o cubo completo.',
          precio_centavos: 8500,
          unidad_medida: 'Metro cúbico (m³)',
          stock: 30,
          duracion_min: 60,
          atributos: {
            amperaje_capacidad: '1 m³ (equivale a 1 cubo estándar)',
            grano_material: 'Agregado / Concreto',
          },
        },
      ],
      generado_por: 'ia_estatico',
      updated_at: now,
    };
  }

  if (/(hotel|hostal|hospedaje|alojamiento|lodge|airbnb|suite|cabaña|cabana)/.test(q)) {
    return {
      rubro_base: 'HOTEL',
      rubro_usuario: rawInput,
      rubro_titulo: 'Hotelería, Suites & Alojamiento VIP',
      subtitulo_panel:
        'Gestión de habitaciones, noches, check-in/check-out, oxigenación y servicios al huésped.',
      badge_panel: 'Panel IA · Hotelería & Suites',
      tema_color: { primaryHex: '#7C3AED', accentHex: '#D4AF37' },
      terminologia: {
        clienteLabel: 'Huésped',
        pedidoLabel: 'Reserva / Estadía',
        catalogoLabel: 'Habitaciones & Planes',
        nuevoItemBtn: 'Agregar Habitación / Suite',
      },
      unidades_medida: ['Noche', 'Hora', 'Day-Use', 'Persona', 'Paquete', 'Suite', 'Semana'],
      campos_especificos: [
        {
          key: 'capacidad_huespedes',
          label: 'Capacidad máxima',
          tipo: 'number',
          placeholder: 'Ej: 2',
          unidad: 'huéspedes',
        },
        {
          key: 'tipo_cama',
          label: 'Configuración de cama',
          tipo: 'select',
          placeholder: 'Tipo de cama',
          opciones: ['King Size', 'Queen', 'Doble Twin', 'Matrimonial', 'Familiar'],
        },
        {
          key: 'amenidades',
          label: 'Amenidades incluidas',
          tipo: 'text',
          placeholder: 'Ej: Oxígeno 24h, Desayuno Buffet, Jacuzzi, Wi-Fi',
        },
      ],
      modulos_panel: [
        {
          id: 'checkin_panel',
          titulo: 'Control de Check-In, Ocupación y Oxigenación',
          descripcion: 'Supervisa ingresos de huéspedes, horario de salida (11:00) y late check-out.',
          tipo_herramienta: 'CHECKIN_CUPO',
        },
      ],
      catalogo_inicial: [
        {
          nombre: 'Suite Matrimonial Oxigenada Vista Plaza',
          descripcion: 'Calefacción radiante, oxígeno enriquecido para altura de Cusco y desayuno andino.',
          precio_centavos: 28000,
          unidad_medida: 'Noche',
          stock: 6,
          duracion_min: 1440,
          atributos: { capacidad_huespedes: '2', tipo_cama: 'King Size', amenidades: 'Oxígeno 24h + Desayuno' },
        },
        {
          nombre: 'Habitación Doble Ejecutiva',
          descripcion: 'Ideal para viajeros o colegas, escritorio ergonómico y fibra óptica.',
          precio_centavos: 19000,
          unidad_medida: 'Noche',
          stock: 10,
          duracion_min: 1440,
          atributos: { capacidad_huespedes: '2', tipo_cama: 'Doble Twin', amenidades: 'Wi-Fi + Calefacción' },
        },
        {
          nombre: 'Plan Day-Use Relax & Ducha Caliente (6 horas)',
          descripcion: 'Descanso previo a tu vuelo o tren hacia Machu Picchu.',
          precio_centavos: 11000,
          unidad_medida: 'Day-Use',
          stock: 8,
          duracion_min: 360,
          atributos: { capacidad_huespedes: '2', tipo_cama: 'Queen', amenidades: 'Infusión de coca + Guardaequipaje' },
        },
      ],
      generado_por: 'ia_estatico',
      updated_at: now,
    };
  }

  if (/(empleo|trabajo|rrhh|talento|reclutamiento|bolsa|personal|vacante)/.test(q)) {
    return {
      rubro_base: 'TURISMO',
      rubro_usuario: rawInput,
      rubro_titulo: 'Bolsa de Empleos, Talento & Servicios RRHH',
      subtitulo_panel:
        'Publicación de vacantes, contratos por jornada/proyecto, validación RENIEC de postulantes y entrevistas.',
      badge_panel: 'Panel IA · Empleos & Talento',
      tema_color: { primaryHex: '#2563EB', accentHex: '#10B981' },
      terminologia: {
        clienteLabel: 'Postulante / Empresa',
        pedidoLabel: 'Postulación / Contratación',
        catalogoLabel: 'Vacantes & Paquetes',
        nuevoItemBtn: 'Publicar Vacante / Servicio',
      },
      unidades_medida: ['Vacante', 'Jornada', 'Hora', 'Mes', 'Proyecto', 'Semana', 'Servicio'],
      campos_especificos: [
        {
          key: 'modalidad_trabajo',
          label: 'Modalidad',
          tipo: 'select',
          placeholder: 'Selecciona modalidad',
          opciones: ['Presencial Cusco', 'Híbrido', 'Remoto', 'Por Turnos / Obra'],
        },
        {
          key: 'remuneracion_rango',
          label: 'Remuneración / Presupuesto',
          tipo: 'text',
          placeholder: 'Ej: S/ 1,800 - S/ 2,500 mensual',
        },
        {
          key: 'experiencia',
          label: 'Experiencia y requisitos',
          tipo: 'text',
          placeholder: 'Ej: 1 año mínimo, licencia A-I o brevete',
        },
      ],
      modulos_panel: [
        {
          id: 'postulaciones_panel',
          titulo: 'Filtro de Postulantes & Verificación RENIEC',
          descripcion: 'Valida identidad real con DNI, agenda entrevistas por WhatsApp y gestiona vacantes.',
          tipo_herramienta: 'POSTULACIONES',
        },
      ],
      catalogo_inicial: [
        {
          nombre: 'Publicación Vacante Destacada + Filtro IA (30 días)',
          descripcion: 'Difusión prioritaria en Cusco con preselección de candidatos verificados por DNI.',
          precio_centavos: 4500,
          unidad_medida: 'Vacante',
          stock: 25,
          duracion_min: 30,
          atributos: { modalidad_trabajo: 'Presencial Cusco', remuneracion_rango: 'Tarifa empresa', experiencia: 'Con verificación RENIEC' },
        },
        {
          nombre: 'Asesoría CV Profesional + Perfil Laboral',
          descripcion: 'Optimización de currículum y preparación de entrevista presencial/remota.',
          precio_centavos: 3500,
          unidad_medida: 'Servicio',
          stock: 40,
          duracion_min: 45,
          atributos: { modalidad_trabajo: 'Híbrido', experiencia: 'Todos los rubros' },
        },
        {
          nombre: 'Contratación Personal por Jornada (Evento / Obra)',
          descripcion: 'Personal técnico o anfitriones certificados por jornada completa de 8 horas.',
          precio_centavos: 9500,
          unidad_medida: 'Jornada',
          stock: 15,
          duracion_min: 480,
          atributos: { modalidad_trabajo: 'Por Turnos / Obra', remuneracion_rango: 'S/ 95.00 por día', experiencia: 'Disponible hoy' },
        },
      ],
      generado_por: 'ia_estatico',
      updated_at: now,
    };
  }

  if (/(pinateria|piñateria|fiesta|cumpleanos|cumpleaños|globo|evento|decoracion|cotillon)/.test(q)) {
    return {
      rubro_base: 'RESTAURANTE',
      rubro_usuario: rawInput,
      rubro_titulo: 'Piñatería, Cotillón & Decoración de Eventos',
      subtitulo_panel:
        'Arma combos por temática, docenas de globos, piñatas personalizadas y decoración por metro.',
      badge_panel: 'Panel IA · Piñatería & Fiestas',
      tema_color: { primaryHex: '#EC4899', accentHex: '#F59E0B' },
      terminologia: {
        clienteLabel: 'Anfitrión / Cliente',
        pedidoLabel: 'Pedido de Fiesta',
        catalogoLabel: 'Piñatas, Globos & Combos',
        nuevoItemBtn: 'Agregar Artículo / Combo',
      },
      unidades_medida: ['Unidad', 'Docena', 'Paquete', 'Combo', 'Metro (m)', 'Ciento', 'Caja', 'Servicio'],
      campos_especificos: [
        {
          key: 'tematica',
          label: 'Temática / Personaje',
          tipo: 'text',
          placeholder: 'Ej: Princesas, Fútbol, Graduación, Neón',
        },
        {
          key: 'capacidad_invitados',
          label: 'Para cuántos invitados',
          tipo: 'number',
          placeholder: 'Ej: 30',
          unidad: 'personas',
        },
        {
          key: 'colores_acabado',
          label: 'Paleta de colores',
          tipo: 'text',
          placeholder: 'Ej: Dorado, rosa pastel y blanco perlado',
        },
      ],
      modulos_panel: [
        {
          id: 'eventos_combo',
          titulo: 'Armador de Combos & Control de Stock por Evento',
          descripcion: 'Organiza pedidos personalizados con anticipación, piñatas y guirnaldas por metro.',
          tipo_herramienta: 'COMANDA_COCINA',
        },
      ],
      catalogo_inicial: [
        {
          nombre: 'Piñata Artesanal 3D Personalizada (Grande)',
          descripcion: 'Estructura reforzada de 80 cm con relleno base y temática a elección.',
          precio_centavos: 6500,
          unidad_medida: 'Unidad',
          stock: 20,
          duracion_min: 60,
          atributos: { tematica: 'A elección del cliente', capacidad_invitados: '30', colores_acabado: 'Full color / Dorado' },
        },
        {
          nombre: 'Arco Orgánico de Globos Chrome (Metro lineal)',
          descripcion: 'Guirnalda instalada con globos látex calibre R12 y metalizados.',
          precio_centavos: 3800,
          unidad_medida: 'Metro (m)',
          stock: 50,
          duracion_min: 45,
          atributos: { tematica: 'Cumpleaños / Corporativo', colores_acabado: 'Chrome Dorado + Azul' },
        },
        {
          nombre: 'Pack Cotillón Fiesta Completa (30 personas)',
          descripcion: 'Incluye vasos, platos, sombreros, velas mágicas, serpentinas y sorpresas.',
          precio_centavos: 8900,
          unidad_medida: 'Combo',
          stock: 30,
          duracion_min: 20,
          atributos: { tematica: 'Infantil / Adultos', capacidad_invitados: '30' },
        },
      ],
      generado_por: 'ia_estatico',
      updated_at: now,
    };
  }

  if (/(farmacia|botica|salud|medicina|clinica|dental|veterinaria|optica)/.test(q)) {
    const isVet = /(veterinaria|mascota|pet)/.test(q);
    return {
      rubro_base: 'FARMACIA',
      rubro_usuario: rawInput,
      rubro_titulo: isVet
        ? 'Veterinaria, PetShop & Farmacia Animal'
        : 'Botica, Salud & Farmacia de Turno',
      subtitulo_panel:
        'Control de dosis por gramos/mililitros, stock farmacéutico, vencimientos y entrega rápida.',
      badge_panel: isVet ? 'Panel IA · Veterinaria & Pet' : 'Panel IA · Botica Clínica',
      tema_color: { primaryHex: '#059669', accentHex: '#06B6D4' },
      terminologia: {
        clienteLabel: isVet ? 'Tutor / Mascota' : 'Paciente / Cliente',
        pedidoLabel: 'Receta / Pedido',
        catalogoLabel: isVet ? 'Farmacia & Servicios Vet' : 'Medicamentos & Salud',
        nuevoItemBtn: 'Agregar Producto / Atención',
      },
      unidades_medida: ['Unidad', 'Caja', 'Blíster', 'Frasco', 'Litro (L)', 'Mililitro (ml)', 'Gramo (g)', 'Kilo (kg)', 'Servicio'],
      campos_especificos: [
        {
          key: 'concentracion',
          label: 'Concentración / Dosis',
          tipo: 'text',
          placeholder: 'Ej: 500 mg / 120 ml / 15 kg',
        },
        {
          key: 'requiere_receta',
          label: 'Condición de venta',
          tipo: 'select',
          placeholder: 'Tipo de venta',
          opciones: ['Venta libre', 'Bajo receta médica', 'Uso veterinario / profesional'],
        },
      ],
      modulos_panel: [
        {
          id: 'stock_clinico',
          titulo: 'Control de Lotes, Dosis & Atención 24h',
          descripcion: 'Gestiona presentaciones en blíster, frascos ml, gramos y citas de consulta.',
          tipo_herramienta: 'RECETARIO_STOCK',
        },
      ],
      catalogo_inicial: isVet
        ? [
            {
              nombre: 'Consulta Veterinaria + Desparasitación',
              descripcion: 'Evaluación clínica completa y dosis exacta por peso en kilos.',
              precio_centavos: 5500,
              unidad_medida: 'Servicio',
              stock: 20,
              duracion_min: 40,
              atributos: { concentracion: 'Según peso (kg)', requiere_receta: 'Uso veterinario / profesional' },
            },
            {
              nombre: 'Alimento Balanceado Premium Adulto (Kilo)',
              descripcion: 'Venta fraccionada por kilo o saco sellado con envío a domicilio.',
              precio_centavos: 1850,
              unidad_medida: 'Kilo (kg)',
              stock: 80,
              duracion_min: 15,
              atributos: { concentracion: '28% Proteína', requiere_receta: 'Venta libre' },
            },
          ]
        : [
            {
              nombre: 'Kit Altura Soroche Cusco + Electrolitos',
              descripcion: 'Incluye sorojchi caps, caramelos de coca y solución hidratante.',
              precio_centavos: 2400,
              unidad_medida: 'Caja',
              stock: 60,
              duracion_min: 15,
              atributos: { concentracion: 'Pack x 10 unidades', requiere_receta: 'Venta libre' },
            },
            {
              nombre: 'Jarabe Broncodilatador / Mucolítico 120 ml',
              descripcion: 'Presentación en frasco sellado con vaso dosificador.',
              precio_centavos: 2900,
              unidad_medida: 'Frasco',
              stock: 35,
              duracion_min: 20,
              atributos: { concentracion: '120 ml', requiere_receta: 'Venta libre' },
            },
          ],
      generado_por: 'ia_estatico',
      updated_at: now,
    };
  }

  if (/(taxi|movilidad|transporte|carga|mudanza|delivery|couriers|moto)/.test(q)) {
    return {
      rubro_base: 'TRANSPORTE',
      rubro_usuario: rawInput,
      rubro_titulo: 'Movilidad, Taxis & Transporte de Carga',
      subtitulo_panel:
        'Despacho en tiempo real con rutas Google Maps Punto A -> Punto B, flota y contraofertas.',
      badge_panel: 'Panel IA · Transporte & Flota',
      tema_color: { primaryHex: '#84CC16', accentHex: '#2563EB' },
      terminologia: {
        clienteLabel: 'Pasajero / Remitente',
        pedidoLabel: 'Viaje / Despacho',
        catalogoLabel: 'Flota & Tarifas',
        nuevoItemBtn: 'Registrar Unidad',
      },
      unidades_medida: ['Viaje', 'Kilómetro (km)', 'Hora', 'Metro cúbico (m³)', 'Tonelada', 'Servicio'],
      campos_especificos: [
        {
          key: 'capacidad_carga',
          label: 'Capacidad de pasajeros / carga',
          tipo: 'text',
          placeholder: 'Ej: 4 pasajeros / 1.5 toneladas',
        },
        {
          key: 'cobertura',
          label: 'Zona / Ruta',
          tipo: 'text',
          placeholder: 'Ej: Cusco Urbano, Valle Sagrado, Aeropuerto',
        },
      ],
      modulos_panel: [
        {
          id: 'ruta_gps',
          titulo: 'Rutas Punto A -> Punto B con Google Maps',
          descripcion: 'Seguimiento en vivo de unidades, tarifas por kilómetro y contraoferta instantánea.',
          tipo_herramienta: 'COTIZADOR_VOLUMEN',
        },
      ],
      catalogo_inicial: [],
      generado_por: 'ia_estatico',
      updated_at: now,
    };
  }

  if (/(restaurante|polleria|ceviche|cafe|cafeteria|panaderia|pasteleria|comida|bar|pizzeria)/.test(q)) {
    return {
      rubro_base: 'RESTAURANTE',
      rubro_usuario: rawInput,
      rubro_titulo: 'Restaurante, Gastronomía & Cocina en Vivo',
      subtitulo_panel:
        'Carta digital por porciones, platos, litros o combos, comandas en tiempo real y facturación SUNAT.',
      badge_panel: 'Panel IA · Gastronomía',
      tema_color: { primaryHex: '#EA580C', accentHex: '#E11D48' },
      terminologia: {
        clienteLabel: 'Comensal',
        pedidoLabel: 'Comanda / Pedido',
        catalogoLabel: 'Carta & Menú del Día',
        nuevoItemBtn: 'Agregar Plato / Bebida',
      },
      unidades_medida: ['Porción', 'Plato', 'Combo', 'Litro (L)', 'Media Fuente', 'Fuente', 'Docena', 'Gramo (g)'],
      campos_especificos: [
        {
          key: 'tiempo_preparacion',
          label: 'Tiempo en cocina',
          tipo: 'number',
          placeholder: 'Ej: 20',
          unidad: 'min',
        },
        {
          key: 'guarniciones',
          label: 'Guarniciones / Acompañamientos',
          tipo: 'text',
          placeholder: 'Ej: Papas nativas, ensalada fresca y cremas',
        },
      ],
      modulos_panel: [
        {
          id: 'comanda_panel',
          titulo: 'Comandas de Cocina & Control de Porciones',
          descripcion: 'Administra entradas, fondos y bebidas por litro o porción sin demoras.',
          tipo_herramienta: 'COMANDA_COCINA',
        },
      ],
      catalogo_inicial: [
        {
          nombre: 'Plato Especial de la Casa + Bebida Natural',
          descripcion: 'Preparado al momento con ingredientes frescos de Cusco.',
          precio_centavos: 3400,
          unidad_medida: 'Plato',
          stock: 40,
          duracion_min: 25,
          atributos: { tiempo_preparacion: '20 min', guarniciones: 'Papas doradas + ensalada' },
        },
        {
          nombre: 'Chicha Morada / Refresco Artesanal (1 Litro)',
          descripcion: 'Envase sellado de 1 litro ideal para compartir.',
          precio_centavos: 1400,
          unidad_medida: 'Litro (L)',
          stock: 30,
          duracion_min: 10,
          atributos: { tiempo_preparacion: '5 min' },
        },
      ],
      generado_por: 'ia_estatico',
      updated_at: now,
    };
  }

  // Generador Universal para cualquier otro negocio del mundo
  const baseRubro: Rubro =
    params.rubro_base_hint ||
    (/(cambio|divisa|dolar|casa de cambio|financ)/.test(q)
      ? 'CASA_CAMBIO'
      : /(tour|viaje|agencia|guia|aventura)/.test(q)
        ? 'TURISMO'
        : 'RESTAURANTE');

  return {
    rubro_base: baseRubro,
    rubro_usuario: rawInput,
    rubro_titulo: `${rawInput} · Panel Inteligente Multi-Rubro`,
    subtitulo_panel: `Entorno operativo personalizado para ${rawInput} con catálogo técnico, medidas flexibles y SUNAT.`,
    badge_panel: `Panel IA · ${rawInput}`,
    tema_color: { primaryHex: '#2563EB', accentHex: '#D4AF37' },
    terminologia: {
      clienteLabel: 'Cliente',
      pedidoLabel: 'Solicitud / Orden',
      catalogoLabel: `Catálogo de ${rawInput}`,
      nuevoItemBtn: `Agregar a ${rawInput}`,
    },
    unidades_medida: [
      'Unidad',
      'Servicio',
      'Hora',
      'Kilo (kg)',
      'Gramo (g)',
      'Litro (L)',
      'Metro (m)',
      'Pulgada (in)',
      'Pie (ft)',
      'Metro cúbico (m³)',
      'Paquete',
      'Caja',
      'Docena',
    ],
    campos_especificos: [
      {
        key: 'especificacion_tecnica',
        label: 'Especificación / Medida',
        tipo: 'text',
        placeholder: 'Ej: Talla, medida, capacidad, voltaje o presentación',
      },
      {
        key: 'garantia_duracion',
        label: 'Garantía o duración',
        tipo: 'text',
        placeholder: 'Ej: 30 días / 1 hora de atención',
      },
    ],
    modulos_panel: [
      {
        id: 'calc_universal',
        titulo: 'Calculadora de Unidades & Cotización Rápida',
        descripcion: `Herramienta de medidas, pesos y volúmenes adaptable para ${rawInput}.`,
        tipo_herramienta: 'CALCULADORA_MEDIDAS',
      },
    ],
    catalogo_inicial: [
      {
        nombre: `Servicio Principal · ${rawInput}`,
        descripcion: `Atención estándar especializada de ${params.nombre || rawInput} en Cusco.`,
        precio_centavos: 4500,
        unidad_medida: 'Servicio',
        stock: 30,
        duracion_min: 30,
        atributos: { especificacion_tecnica: 'Atención personalizada', garantia_duracion: 'Garantía La Chuspa' },
      },
      {
        nombre: `Paquete / Producto Destacado · ${rawInput}`,
        descripcion: `Presentación comercial lista para despacho inmediato o recojo en tienda.`,
        precio_centavos: 6500,
        unidad_medida: 'Unidad',
        stock: 25,
        duracion_min: 20,
        atributos: { especificacion_tecnica: 'Presentación estándar' },
      },
    ],
    generado_por: 'ia_estatico',
    updated_at: now,
  };
}

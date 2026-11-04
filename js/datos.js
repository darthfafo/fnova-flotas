// Catálogo de batallones y facciones. Los números de Ataque / Escudo /
// Estructura parten de servidor/src/naves.ts de FNOVA y se escalan para que
// una batalla en tiempo real dure minutos y no segundos: las naves capitales
// reciben más multiplicador de aguante que las chicas, igual que en Homeworld.

// Piezas de las misiones de campaña: el carguero cambia según la facción.
const piezas = (carguero) => ({ carguero, derelicto: 'executioner', estacion: 'gen-estacion', laboratorio: 'gen-laboratorio', repetidor: 'gen-repetidor', mente: 'gen-mente' })

export const FACCIONES = {
  guardianes: {
    clave: 'guardianes',
    nombre: 'Guardianes',
    lema: 'La Orden que hace cumplir la prohibición',
    descripcion:
      'Custodios de la ley post-Quema. Cascos de bronce curtido con circuitos azules de tecnología antigua. Disciplina, formación cerrada y blindaje.',
    imagen: 'assets/img/guardianes.jpg',
    casco: [1.08, 0.92, 0.72], // tinte cálido de bronce sobre el gris del modelo
    acento: 0x3fa9ff,
    acentoCss: '#3fa9ff',
    disparo: 0x7cc8ff,
    modelos: { caza: 'hgn-interceptor', corbeta: 'hgn-bomber', bombardero: 'hgn-gunship', crucero: 'hgn-destroyer', portanaves: 'hgn-carrier', acorazado: 'hgn-battlecruiser', ...piezas('rylek-brig') },
    // Rasgo de batalla: aguantan más, pegan igual, se mueven un poco más lento.
    rasgo: {
      nombre: 'Disciplina de la Orden',
      escudo: 1.15,
      regenEscudo: 1.3,
      velocidad: 0.93,
      efectos: ['+15% de escudo en todas las naves', 'Los escudos se recargan un 30% más rápido', '−7% de velocidad'],
      estilo: 'Brillan con cazas y corbetas que entran y salen del combate. Les cuesta perseguir.',
    },
  },
  inquisidores: {
    clave: 'inquisidores',
    nombre: 'Inquisidores',
    lema: 'La Orden que no le teme al conocimiento',
    descripcion:
      'Herejes pragmáticos que reactivan lo que las Mentes dejaron. Aleación oscura con vetas rojas y ámbar. Agresivos y difíciles de predecir.',
    imagen: 'assets/img/inquisidores.jpg',
    casco: [0.62, 0.6, 0.64],
    acento: 0xff4a2a,
    acentoCss: '#ff5a36',
    disparo: 0xffa040,
    modelos: { caza: 'vgr-lance', corbeta: 'vgr-bomber', bombardero: 'vgr-corvette', crucero: 'vgr-destroyer', portanaves: 'vgr-carrier', acorazado: 'vgr-battlecruiser', ...piezas('rlab-fragata') },
    // Rasgo de batalla: pegan más y son más rápidos, con escudos más débiles.
    rasgo: {
      nombre: 'Tecnología prohibida',
      daño: 1.14,
      velocidad: 1.08,
      escudo: 0.88,
      efectos: ['+14% de daño en todas las armas', '+8% de velocidad', '−12% de escudo'],
      estilo: 'Golpean primero y dominan los combates entre naves capitales. Sufren contra enjambres que se reparan.',
    },
  },
  // Maquinaria común tomada por la Mente: solo aparece en la campaña.
  automatas: {
    clave: 'automatas',
    nombre: 'Autómatas',
    soloCampana: true,
    lema: 'Sin mente propia, hasta que alguien les presta una',
    descripcion: '',
    casco: [0.5, 0.56, 0.54],
    acento: 0x5dffb0,
    acentoCss: '#5dffb0',
    disparo: 0x8dffc8,
    modelos: { caza: 'dispatcher', corbeta: 'rlab-ranger', bombardero: 'rylek-skiff', crucero: 'rylek-galley', portanaves: 'rlab-skycruiser', acorazado: 'rylek-galleon', ...piezas('bob') },
    rasgo: { escudo: 0.8, efectos: [], estilo: '' },
  },
}

// Clase de tamaño: decide la puntería de quien dispara (un cañón de
// Acorazado casi no le acierta a un Caza) y cómo se mueve la nave.
export const CHICA = 'chica'
export const CAPITAL = 'capital'

export const TIPOS = {
  caza: {
    clave: 'caza',
    nombre: 'Caza',
    clase: CHICA,
    porBatallon: 5,
    costo: 300,
    largo: 7,
    ataque: 40, escudo: 10, estructura: 80, // FNOVA
    escudoMax: 40, estructuraMax: 130,
    velocidad: 78, giro: 2.6, aceleracion: 60,
    armas: [{ tipo: 'laser', daño: 6, cadencia: 0.32, alcance: 210, cono: 0.22 }],
    ventaja: { bombardero: 1.75 },
    // Contra naves chicas se pone en la cola del enemigo y lo persigue.
    maniobra: 'persecucion',
    rol: 'Caza parejo y rápido. Intercepta Bombarderos antes de que lleguen a tus capitales.',
  },
  corbeta: {
    clave: 'corbeta',
    nombre: 'Corbeta',
    clase: CHICA,
    porBatallon: 3,
    costo: 300,
    largo: 6,
    ataque: 55, escudo: 6, estructura: 48,
    escudoMax: 35, estructuraMax: 130,
    agilidad: 0.85, // le acierta un 15% menos todo lo que le dispara (salvo el flak)
    velocidad: 92, giro: 3.0, aceleracion: 75,
    // Ametralladoras en torretas laterales: dispara en un cono ancho mientras
    // orbita al blanco.
    armas: [{ tipo: 'laser', daño: 10, cadencia: 0.3, alcance: 180, cono: 0.75 }],
    ventaja: { caza: 1.4 },
    maniobra: 'orbita',
    rol: 'Interceptor ágil: le acierta menos todo lo que le dispara y destroza Cazas. Sufre contra el flak.',
  },
  bombardero: {
    clave: 'bombardero',
    nombre: 'Bombardero',
    clase: CHICA,
    porBatallon: 2,
    costo: 450,
    largo: 11,
    ataque: 70, escudo: 25, estructura: 180,
    escudoMax: 120, estructuraMax: 420,
    velocidad: 50, giro: 1.4, aceleracion: 30,
    armas: [{ tipo: 'torpedo', daño: 120, cadencia: 2.2, alcance: 300, cono: 0.35 }],
    // Se alinea con su batallón y hace pasadas rectas; sale en una curva amplia.
    maniobra: 'pasada',
    ventaja: { crucero: 2.2, portanaves: 2.1, acorazado: 2.1 },
    rol: 'Torpedos lentos y devastadores contra naves capitales. Indefenso ante cazas.',
  },
  crucero: {
    clave: 'crucero',
    nombre: 'Crucero',
    clase: CAPITAL,
    porBatallon: 1,
    costo: 900,
    largo: 48,
    ataque: 85, escudo: 40, estructura: 260,
    escudoMax: 700, estructuraMax: 3600,
    velocidad: 22, giro: 0.38, aceleracion: 6,
    armas: [
      // Dos torretas en el eje (cubren casi todo) y una por banda.
      { tipo: 'flak', daño: 8, cadencia: 0.55, alcance: 420, montaje: [0, 0.25, 0.25] },
      { tipo: 'flak', daño: 8, cadencia: 0.55, alcance: 420, montaje: [0, -0.2, -0.1] },
      { tipo: 'flak', daño: 8, cadencia: 0.55, alcance: 420, montaje: [-0.3, 0.2, -0.2] },
      { tipo: 'flak', daño: 8, cadencia: 0.55, alcance: 420, montaje: [0.3, 0.2, -0.2] },
    ],
    ventaja: { caza: 1.6, corbeta: 1.5, bombardero: 1.25 },
    rol: 'Torretas de flak que barren Corbetas y Cazas. Necesita escolta contra los Bombarderos.',
  },
  portanaves: {
    clave: 'portanaves',
    nombre: 'Portanaves',
    clase: CAPITAL,
    porBatallon: 1,
    costo: 1300,
    largo: 72,
    ataque: 60, escudo: 50, estructura: 340,
    escudoMax: 1100, estructuraMax: 4800,
    velocidad: 15, giro: 0.26, aceleracion: 4,
    armas: [
      { tipo: 'flak', daño: 7, cadencia: 0.6, alcance: 400, montaje: [-0.3, 0.15, 0] },
      { tipo: 'flak', daño: 7, cadencia: 0.6, alcance: 400, montaje: [0.3, 0.15, 0] },
    ],
    // Hangar: lanza cazas a su propia escuadrilla (un batallón más que podés
    // mandar), uno cada `intervalo` segundos hasta tener `capacidad` vivos,
    // con `reserva` cazas en total (así dos portanaves no empatan para
    // siempre). Los cazas lanzados no suman ni restan valor de flota.
    hangar: { tipo: 'caza', capacidad: 6, intervalo: 7, primero: 3, reserva: 18 },
    ventaja: {},
    rol: 'Lanza cazas a su escuadrilla y repone las bajas (18 en el hangar). Armas débiles: protegelo de Bombarderos y Cruceros.',
  },
  acorazado: {
    clave: 'acorazado',
    nombre: 'Acorazado',
    clase: CAPITAL,
    porBatallon: 1,
    costo: 1800,
    largo: 85,
    ataque: 120, escudo: 60, estructura: 400,
    escudoMax: 1800, estructuraMax: 6500,
    velocidad: 13, giro: 0.22, aceleracion: 3,
    armas: [
      { tipo: 'cañon', daño: 45, cadencia: 1.6, alcance: 620, montaje: [0, 0.3, 0.4] },
      { tipo: 'cañon', daño: 45, cadencia: 1.6, alcance: 620, montaje: [0, 0.3, 0.1] },
      { tipo: 'flak', daño: 12.5, cadencia: 0.6, alcance: 420, montaje: [-0.35, 0.15, -0.1] },
      { tipo: 'flak', daño: 12.5, cadencia: 0.6, alcance: 420, montaje: [0.35, 0.15, -0.1] },
      { tipo: 'flak', daño: 12.5, cadencia: 0.6, alcance: 420, montaje: [0, -0.2, 0] },
      { tipo: 'cañon', daño: 45, cadencia: 1.6, alcance: 620, montaje: [0, 0.3, -0.3] },
    ],
    ventajaGeneral: 1.25,
    rol: 'Nave capital definitiva: +25% de daño contra todo y se impone al Crucero. Necesita escolta contra Bombarderos.',
  },
}

// Piezas de la campaña: no se compran ni se mandan, las maneja la misión.
const pieza = (clave, nombre, largo, escudoMax, estructuraMax, resto = {}) => ({
  clave, nombre, largo, escudoMax, estructuraMax,
  clase: CAPITAL, porBatallon: 1, costo: 0,
  ataque: 0, escudo: 0, estructura: 0,
  velocidad: 0, giro: 0, aceleracion: 0,
  armas: [], ventaja: {}, rol: '',
  ...resto,
})
const torreta = (x, z) => ({ tipo: 'flak', daño: 8, cadencia: 0.6, alcance: 420, montaje: [x, 0.1, z] })
Object.assign(TIPOS, {
  carguero: pieza('carguero', 'Carguero', 40, 800, 2600, { velocidad: 16, giro: 0.4, aceleracion: 5 }),
  derelicto: pieza('derelicto', 'Nave varada', 60, 0, 5000),
  estacion: pieza('estacion', 'Estación', 110, 900, 4200, { armas: [torreta(0, 0.3), torreta(0, -0.3), torreta(0.3, 0), torreta(-0.3, 0)] }),
  laboratorio: pieza('laboratorio', 'Laboratorio', 130, 1500, 6000, { armas: [torreta(0, 0.3), torreta(0, -0.3), torreta(0.3, 0), torreta(-0.3, 0)] }),
  repetidor: pieza('repetidor', 'Repetidor', 30, 500, 1700, { armas: [torreta(0, 0), torreta(0, 0)] }),
  mente: pieza('mente', 'La Mente', 240, 2000, 9000, { armas: [torreta(0.2, 0), torreta(-0.2, 0), torreta(0, 0.2), torreta(0, -0.2)] }),
})

export const ORDEN_TIPOS = ['caza', 'corbeta', 'bombardero', 'crucero', 'portanaves', 'acorazado']

// Probabilidad de acierto según el arma y el tamaño del blanco.
export const PUNTERIA = {
  laser: { chica: 0.55, capital: 0.95 },
  torpedo: { chica: 0.12, capital: 0.92 },
  flak: { chica: 0.5, capital: 0.9 },
  cañon: { chica: 0.14, capital: 0.95 },
}

export const PROYECTIL = {
  laser: { velocidad: 520, largo: 7, grosor: 0.5 },
  torpedo: { velocidad: 150, largo: 5, grosor: 1.6 },
  flak: { velocidad: 480, largo: 6, grosor: 0.7 },
  cañon: { velocidad: 360, largo: 16, grosor: 1.8 },
}

export function multiplicadorDaño(tipoAtacante, tipoObjetivo) {
  const t = TIPOS[tipoAtacante]
  return (t.ventajaGeneral ?? 1) * (t.ventaja?.[tipoObjetivo] ?? 1)
}

// Las formaciones no dan bonus: cambian cómo se acomodan y se mueven las naves,
// y la ventaja sale de eso. Solo las pueden usar ciertas naves. En el panel y
// en las teclas aparecen las que sirven para lo seleccionado.
export const FORMACIONES = {
  delta: { nombre: 'Delta', efecto: 'Para viajar. Al atacar, cada nave pelea por su cuenta.' },
  linea: { nombre: 'Línea', tipos: ['crucero', 'portanaves', 'acorazado'], efecto: 'En columna y navegando para el mismo lado: todas muestran la banda. De frente llegan de a una.' },
  cuna: { nombre: 'Cuña', tipos: ['caza', 'corbeta'], efecto: 'Llegan juntas al blanco y pegan a la vez. Apretadas, el flak las castiga más.' },
  caja: { nombre: 'Caja', tipos: ['bombardero'], efecto: 'Avanzan escalonados y sueltan los torpedos juntos. Apretados son blanco fácil para el flak.' },
  pantalla: { nombre: 'Pantalla', tipos: ['caza', 'corbeta'], efecto: 'Rodean a la capital más cercana y atacan lo que se le acerque. No persiguen.' },
  tijera: { nombre: 'Tijera', tipos: ['caza'], efecto: 'Se cruzan sin parar, difíciles de seguir, y atacan primero a quien persigue a un compañero.' },
  pinza: { nombre: 'Pinza', tipos: ['caza', 'corbeta', 'bombardero'], efecto: 'Dos batallones dan un rodeo y entran por lados opuestos: el blanco no puede cubrir los dos.' },
}
export const TECLAS_FORMACION = ['z', 'x', 'c', 'v', 'b', 'n', 'g']

export function puedeFormar(tipo, formacion) {
  const t = FORMACIONES[formacion]?.tipos
  return !!FORMACIONES[formacion] && (!t || t.includes(tipo))
}

// Las formaciones que sirven para al menos uno de estos batallones.
export function formacionesPara(batallones) {
  return Object.keys(FORMACIONES).filter((f) => !batallones.length ? f === 'delta' : batallones.some((b) => puedeFormar(b.tipo.clave, f)))
}

export const TACTICAS = {
  agresiva: { nombre: 'Agresiva', alcanceDeteccion: 1400 },
  neutral: { nombre: 'Neutral', alcanceDeteccion: 650 },
  evasiva: { nombre: 'Evasiva', alcanceDeteccion: 0 },
}

export const DIFICULTADES = {
  facil: { nombre: 'Fácil', presupuesto: 0.8, reaccion: 3.5, usaContras: false },
  normal: { nombre: 'Normal', presupuesto: 1, reaccion: 1.5, usaContras: true },
  dificil: { nombre: 'Difícil', presupuesto: 1.25, reaccion: 0.6, usaContras: true },
}

export const PRESUPUESTO_BASE = 4500

// Tamaños de batalla que se ofrecen en el armado de flota (el jugador
// también puede ajustar de a 500 entre el mínimo y el máximo).
export const PRESUPUESTOS = [
  { nombre: 'Escaramuza', valor: 2500 },
  { nombre: 'Batalla', valor: 4500 },
  { nombre: 'Guerra', valor: 8000 },
  { nombre: 'Épica', valor: 14000 },
]
export const PRESUPUESTO_MIN = 1500
export const PRESUPUESTO_MAX = 20000

// La primera campaña: cinco escenarios seguidos. Las dos Órdenes viven los
// mismos hechos en los mismos lugares, desde lados opuestos. Es otro momento
// de la historia: de FNOVA solo se heredan la Quema, las Mentes y las Órdenes.
//
// Cada toma de un relato: { texto, foco, dist, yaw: [desde, hasta], pitch }.
// foco es 'jugador', 'enemigo', el id de una pieza o [x, y, z].

const VOZ = { guardianes: 'Mando de la Orden', inquisidores: 'Cónclave' }

const CRONICAS = {
  deriva: {
    titulo: 'Rumbo fijado',
    texto: 'Los registros hablan de naves perdidas desde hace siglos. Ninguna figura con tripulación. Todas figuran con rumbo.',
  },
  vigia: {
    titulo: 'Las cuentas de Vigía',
    texto: 'La estación llevaba trescientos años contando naves que pasaban sin bandera. Nadie leía esas cuentas. Algo se había ocupado de que nadie las leyera.',
  },
  bandera: {
    titulo: 'Sin bandera',
    texto: 'Un convoy sin bandera no es de nadie: por eso cruza cualquier frente. Ninguna de las dos Órdenes admite haberlos usado. Las dos lo hicieron.',
  },
  pregunta: {
    titulo: 'La pregunta',
    texto: 'En las dos flotas circula la misma pregunta, que nadie hace en voz alta: si las Mentes fueron prohibidas para siempre, ¿quién decidió dejar este bastión en pie?',
  },
  ecos: {
    titulo: 'Ecos de la Quema',
    texto: 'No todas las Mentes fueron destruidas. Lo que no está escrito en ninguna parte es cuántas, ni dónde, ni quién decidió que algunas merecían sobrevivir.',
  },
}

const DERROTA_G = [{ texto: 'La flota no volvió. Y lo que había que detener <b>sigue allá afuera</b>.', foco: 'enemigo', dist: 500, yaw: [0.4, 0.7], pitch: 0.3 }]
const DERROTA_I = [{ texto: 'El Cónclave no perdona a quien pierde lo que costó tres siglos encontrar.', foco: 'enemigo', dist: 500, yaw: [0.4, 0.7], pitch: 0.3 }]

const convoy = (faccion, equipo, salida) =>
  ['c1', 'c2', 'c3'].map((id, i) => ({
    id,
    tipo: 'carguero',
    equipo,
    faccion,
    nombre: `Carguero ${i + 1}`,
    pos: [-1150 - i * 130, 10 + i * 25, -260 + i * 90],
    rumbo: [1, 0, 0],
    ruta: [{ p: salida }],
  }))

const REPETIDORES = [
  { id: 'r1', tipo: 'repetidor', equipo: 'enemigo', nombre: 'Repetidor', pos: [-720, 20, -420] },
  { id: 'r2', tipo: 'repetidor', equipo: 'enemigo', nombre: 'Repetidor', pos: [720, -30, -420] },
  { id: 'r3', tipo: 'repetidor', equipo: 'enemigo', nombre: 'Repetidor', pos: [0, 60, -1150] },
]
const MENTE = { id: 'mente', tipo: 'mente', equipo: 'enemigo', nombre: 'La Mente', pos: [0, 40, -620], invulnerable: true }
const ONDA_AUTOMATAS = { cada: 45, desde: 35, mientras: 'repetidores', oleada: { flota: { caza: 2, corbeta: 1 }, pos: [0, 40, -760] } }

export const ESCENARIOS = [
  {
    clave: 'deriva',
    numero: 'I',
    titulo: 'Nave a la deriva',
    lugar: 'Frontera exterior',
    x: 12, y: 74,
    mapa: 'mixto',
    semilla: 1101,
    cronica: CRONICAS.deriva,
    guardianes: {
      resumen: 'Una nave varada lleva algo que no debería existir. Destruila antes de que los Inquisidores terminen de vaciarla.',
      jugador: { flota: { caza: 3, corbeta: 2, bombardero: 2, crucero: 1 }, pos: [0, 0, 720] },
      enemigo: { flota: { caza: 2, corbeta: 1 }, pos: [0, 0, -420] },
      piezas: [
        { id: 'varada', tipo: 'derelicto', equipo: 'enemigo', nombre: 'Nave varada', pos: [0, 0, -120], rumbo: [1, 0, 0.3] },
        { id: 'remolcador', tipo: 'carguero', equipo: 'enemigo', nombre: 'Remolcador', pos: [130, 30, -190], rumbo: [-1, 0, 0.2] },
      ],
      objetivos: [{ id: 'varada', tipo: 'destruir', piezas: ['varada'], texto: 'Destruí la nave varada', limite: 300 }],
      eventos: [
        { t: 3, quien: 'Mando de la Orden', texto: 'Los Bombarderos abren el casco. Seleccionalos y atacá la nave varada.' },
        { t: 110, quien: 'Sensores', texto: 'Refuerzos Inquisidores saliendo del salto.', oleada: { flota: { caza: 1, corbeta: 1 }, pos: [600, 40, -500] } },
        { t: 240, quien: 'Sensores', texto: 'Están por terminar de vaciar la nave. Queda un minuto.' },
      ],
      relato: [
        { texto: 'Una patrulla encontró una nave a la deriva, cargada con algo que no debería existir.', foco: 'varada', dist: 170, yaw: [0.2, 0.8], pitch: 0.25 },
        { texto: 'Tres siglos de prohibición dependen de que esa carga nunca llegue a un laboratorio.', foco: 'varada', dist: 90, yaw: [2.4, 2.9], pitch: -0.1 },
        { texto: 'Los <span class="i">Inquisidores</span> llegaron primero y ya la están vaciando.', foco: 'remolcador', dist: 150, yaw: [3.6, 4.0], pitch: 0.3 },
        { texto: 'Tu primera orden como comandante es simple: <b>que no quede nada.</b>', foco: 'jugador', dist: 260, yaw: [0.5, 0.2], pitch: 0.2 },
      ],
      victoria: [
        { texto: 'El casco se parte en silencio. Lo que llevaba adentro ya no existe.', foco: 'varada', dist: 220, yaw: [1, 1.4], pitch: 0.3 },
        { texto: 'Pero la bitácora rescatada dice otra cosa: la nave no iba a la deriva. <b>Alguien la mandó.</b>', foco: 'jugador', dist: 300, yaw: [0.3, 0.7], pitch: 0.25 },
      ],
      derrota: DERROTA_G,
    },
    inquisidores: {
      resumen: 'Hay una Reliquia de las Mentes en una nave varada. El remolcador tiene que llegar, extraerlo y saltar. Cuidalo.',
      jugador: { flota: { caza: 2, corbeta: 2, crucero: 1 }, pos: [0, 0, 640] },
      enemigo: { flota: { caza: 2, corbeta: 1 }, pos: [-200, 0, -800] },
      piezas: [
        { id: 'varada', tipo: 'derelicto', equipo: 'jugador', decorado: true, nombre: 'Nave varada', pos: [0, 0, -120], rumbo: [1, 0, 0.3] },
        {
          id: 'remolcador', tipo: 'carguero', equipo: 'jugador', nombre: 'Remolcador', pos: [0, 30, 520],
          ruta: [
            { p: [40, 30, -20], margen: 40, pausa: 25, quien: 'Remolcador', texto: 'Amarrados. Extrayendo la Reliquia: veinticinco segundos.' },
            { p: [1000, 60, 260] },
          ],
        },
      ],
      objetivos: [
        { id: 'remolcador', tipo: 'escoltar', piezas: ['remolcador'], minimo: 1, texto: 'Llevá el remolcador al punto de salto' },
      ],
      eventos: [
        { t: 3, quien: 'Cónclave', texto: 'El remolcador va solo. Tu flota no se separa de él.' },
        { t: 50, quien: 'Sensores', texto: 'Cazas Guardianes por el flanco.', oleada: { flota: { caza: 1, corbeta: 1 }, pos: [900, 30, 100], rumbo: [-1, 0, 0] } },
        { t: 105, quien: 'Sensores', texto: 'Más Guardianes en la ruta de salto.', oleada: { flota: { caza: 2 }, pos: [700, 60, -300], rumbo: [0, 0, 1] } },
      ],
      relato: [
        { texto: 'Durante trescientos años nos dijeron que el conocimiento de las Mentes había muerto con ellas.', foco: 'varada', dist: 170, yaw: [3.4, 3.9], pitch: 0.25 },
        { texto: 'Esta nave varada es la prueba de que nos mintieron: su bodega todavía <b>late</b>.', foco: 'varada', dist: 90, yaw: [0.4, 0.9], pitch: -0.1 },
        { texto: 'El remolcador tiene que llegar, extraer la Reliquia y saltar.', foco: 'remolcador', dist: 110, yaw: [0.6, 0.2], pitch: 0.25 },
        { texto: 'Los <span class="g">Guardianes</span> preferirían quemarlo antes que entenderlo. <b>No se lo permitas.</b>', foco: 'jugador', dist: 260, yaw: [0.5, 0.2], pitch: 0.2 },
      ],
      victoria: [
        { texto: 'El remolcador desaparece en el salto con la Reliquia a bordo.', foco: 'jugador', dist: 300, yaw: [1, 1.4], pitch: 0.25 },
        { texto: 'En la bodega encuentran un rastro: la nave no iba a la deriva. <b>Alguien la mandó.</b>', foco: 'jugador', dist: 220, yaw: [0.3, 0.7], pitch: 0.2 },
      ],
      derrota: DERROTA_I,
    },
  },
  {
    clave: 'vigia',
    numero: 'II',
    titulo: 'La estación Vigía',
    lugar: 'Cinturón Vigía',
    x: 30, y: 38,
    mapa: 'asteroides',
    semilla: 2207,
    cronica: CRONICAS.vigia,
    guardianes: {
      resumen: 'El rastro lleva a la estación Vigía. Los Inquisidores vienen por sus registros. Resistí hasta que llegue la Orden.',
      jugador: { flota: { caza: 3, corbeta: 2, bombardero: 1, crucero: 1 }, pos: [0, 0, 300] },
      enemigo: { flota: { caza: 2, corbeta: 1, bombardero: 1 }, pos: [0, 0, -850] },
      piezas: [{ id: 'puesto', tipo: 'estacion', equipo: 'jugador', nombre: 'Estación Vigía', pos: [0, 0, 620] }],
      objetivos: [
        { id: 'tiempo', tipo: 'resistir', segundos: 240, texto: 'Resistí hasta que llegue la Orden' },
        { id: 'puesto', tipo: 'proteger', piezas: ['puesto'], continuo: true, texto: 'La estación Vigía no puede caer' },
      ],
      eventos: [
        { t: 60, quien: 'Sensores', texto: 'Segunda ola. Traen Bombarderos para la estación.', oleada: { flota: { caza: 2, bombardero: 1 }, pos: [-700, 30, -600] } },
        { t: 130, quien: 'Sensores', texto: 'Un Crucero Inquisidor entra al cinturón.', oleada: { flota: { corbeta: 2, crucero: 1 }, pos: [700, 0, -700] } },
        { t: 165, quien: 'Mando de la Orden', texto: 'Cazas de la Orden llegando a tu posición. Aguantá.', refuerzo: { flota: { caza: 2, corbeta: 1 }, pos: [0, 40, 900] } },
      ],
      relato: [
        { texto: 'La bitácora señala a la estación Vigía, un puesto viejo en medio del cinturón.', foco: 'puesto', dist: 230, yaw: [0.6, 1.2], pitch: 0.3 },
        { texto: 'Sus registros guardan trescientos años de rutas. <b>Los Inquisidores no vienen a pedirlos.</b>', foco: 'enemigo', dist: 380, yaw: [3.3, 3.7], pitch: 0.2 },
        { texto: 'Mandaron una flota.', foco: 'enemigo', dist: 180, yaw: [3.7, 3.9], pitch: 0.1 },
        { texto: 'Los registros de la estación no pueden caer en sus manos. <b>Sostené la línea.</b>', foco: 'jugador', dist: 280, yaw: [0.4, 0.1], pitch: 0.2 },
      ],
      victoria: [
        { texto: 'Las naves de la Orden llenan el cinturón y el enemigo se retira.', foco: 'puesto', dist: 280, yaw: [1, 1.5], pitch: 0.3 },
        { texto: 'En los registros aparece una ruta: convoyes sin bandera que cruzan la nebulosa <b>una y otra vez</b>.', foco: 'puesto', dist: 150, yaw: [2.2, 2.6], pitch: 0.1 },
      ],
      derrota: [{ texto: 'La estación cae, y con ella los únicos registros del rastro.', foco: 'enemigo', dist: 400, yaw: [0.4, 0.7], pitch: 0.3 }],
    },
    inquisidores: {
      resumen: 'Los Guardianes se atrincheraron en la estación Vigía con los registros del rastro. Destruila.',
      jugador: { flota: { caza: 3, corbeta: 2, bombardero: 3, crucero: 2 }, pos: [0, 0, 760] },
      enemigo: { flota: { caza: 2, corbeta: 1, crucero: 1 }, pos: [0, 0, -320] },
      piezas: [{ id: 'puesto', tipo: 'estacion', equipo: 'enemigo', nombre: 'Estación Vigía', pos: [0, 0, -620] }],
      objetivos: [{ id: 'puesto', tipo: 'destruir', piezas: ['puesto'], texto: 'Destruí la estación Vigía' }],
      eventos: [
        { t: 3, quien: 'Cónclave', texto: 'Sus torretas castigan a las naves chicas. Los Bombarderos son la llave.' },
        { t: 140, quien: 'Sensores', texto: 'Refuerzos Guardianes en camino.', oleada: { flota: { caza: 2, corbeta: 1 }, pos: [0, 40, -950] } },
      ],
      relato: [
        { texto: 'El rastro de la Reliquia termina en la estación Vigía, un puesto viejo en medio del cinturón.', foco: 'puesto', dist: 230, yaw: [3.6, 4.2], pitch: 0.3 },
        { texto: 'Los <span class="g">Guardianes</span> se atrincheraron ahí para borrar los registros.', foco: 'enemigo', dist: 360, yaw: [3.1, 3.5], pitch: 0.2 },
        { texto: 'El Cónclave ya decidió: <b>la estación cae hoy.</b>', foco: 'jugador', dist: 280, yaw: [0.4, 0.1], pitch: 0.2 },
      ],
      victoria: [
        { texto: 'La estación se apaga. Sus bancos de memoria flotan entre los restos.', foco: 'jugador', dist: 320, yaw: [1, 1.5], pitch: 0.3 },
        { texto: 'En ellos aparece una ruta: convoyes sin bandera que cruzan la nebulosa <b>una y otra vez</b>.', foco: 'jugador', dist: 200, yaw: [2.2, 2.6], pitch: 0.1 },
      ],
      derrota: DERROTA_I,
    },
  },
  {
    clave: 'convoy',
    numero: 'III',
    titulo: 'El convoy de la nebulosa',
    lugar: 'Nebulosa Sombra',
    x: 52, y: 62,
    mapa: 'nebulosa',
    semilla: 3313,
    cronica: CRONICAS.bandera,
    guardianes: {
      resumen: 'Un convoy sin bandera cruza la nebulosa con reliquias de las Mentes. Destruí al menos dos cargueros antes de que salten.',
      jugador: { flota: { caza: 4, corbeta: 3, bombardero: 2, crucero: 1 }, pos: [100, 0, 720] },
      enemigo: { flota: { caza: 3, corbeta: 2 }, pos: [-700, 20, -60], rumbo: [1, 0, 0] },
      piezas: convoy(undefined, 'enemigo', [1250, 40, -180]),
      objetivos: [{ id: 'convoy', tipo: 'interceptar', piezas: ['c1', 'c2', 'c3'], maximo: 1, texto: 'Destruí dos cargueros' }],
      eventos: [
        { t: 3, quien: 'Sensores', texto: 'Tenemos sus balizas. La escolta se esconde en la nebulosa.' },
        { t: 60, quien: 'Sensores', texto: 'Emboscada desde la nube.', oleada: { flota: { caza: 2 }, pos: [300, 0, 150] } },
      ],
      relato: [
        { texto: 'El convoy existe. Viaja sin banderas, por donde los sensores no llegan.', foco: 'c1', dist: 200, yaw: [1.2, 1.7], pitch: 0.25 },
        { texto: 'Sus bodegas están llenas de <b>reliquias de las Mentes</b>. Y no todas están muertas.', foco: 'c2', dist: 110, yaw: [2.3, 2.7], pitch: 0.05 },
        { texto: 'Cada carguero que salte es un laboratorio más en algún rincón de la galaxia.', foco: 'enemigo', dist: 300, yaw: [0.7, 1.1], pitch: 0.2 },
        { texto: 'Entrá a la nube. <b>Cortales el paso.</b>', foco: 'jugador', dist: 260, yaw: [0.5, 0.2], pitch: 0.2 },
      ],
      victoria: [
        { texto: 'Los restos del convoy arden dentro de la nube.', foco: 'jugador', dist: 320, yaw: [1, 1.5], pitch: 0.3 },
        { texto: 'Un piloto capturado habla antes de morir: todas las reliquias iban al mismo lugar. <b>Un bastión anterior a la Quema.</b>', foco: 'jugador', dist: 200, yaw: [2.4, 2.8], pitch: 0.1 },
      ],
      derrota: [{ texto: 'Los cargueros saltan. Las reliquias ya están fuera de tu alcance.', foco: 'jugador', dist: 400, yaw: [0.4, 0.7], pitch: 0.3 }],
    },
    inquisidores: {
      resumen: 'Tu convoy cruza la nebulosa con el cargamento. Llevá al menos dos cargueros al punto de salto.',
      jugador: { flota: { caza: 3, corbeta: 3, crucero: 1 }, pos: [-880, 10, -120], rumbo: [1, 0, 0] },
      enemigo: { flota: { caza: 2, corbeta: 1, bombardero: 1 }, pos: [100, 0, 800] },
      piezas: convoy(undefined, 'jugador', [1250, 40, -180]),
      objetivos: [{ id: 'convoy', tipo: 'escoltar', piezas: ['c1', 'c2', 'c3'], minimo: 2, texto: 'Llevá dos cargueros al salto' }],
      eventos: [
        { t: 3, quien: 'Cónclave', texto: 'La nebulosa los esconde de sus sensores, pero no a sus balizas.' },
        { t: 45, quien: 'Sensores', texto: 'Bombarderos Guardianes por el sur.', oleada: { flota: { caza: 1, bombardero: 1 }, pos: [-200, -20, 700] } },
        { t: 95, quien: 'Sensores', texto: 'Nos cortan el paso. Están frente al salto.', oleada: { flota: { caza: 2, corbeta: 1 }, pos: [900, 30, -700], rumbo: [0, 0, 1] } },
      ],
      relato: [
        { texto: 'El Cónclave nunca mueve una reliquia en su nombre. Para eso están los convoyes sin bandera.', foco: 'c1', dist: 200, yaw: [1.2, 1.7], pitch: 0.25 },
        { texto: 'Tres cargueros con el trabajo de una generación entera cruzan la nebulosa.', foco: 'c2', dist: 110, yaw: [2.3, 2.7], pitch: 0.05 },
        { texto: 'Los <span class="g">Guardianes</span> saben la ruta. Alguien habló.', foco: 'enemigo', dist: 300, yaw: [0.7, 1.1], pitch: 0.2 },
        { texto: 'Perdé las naves que tengas que perder. <b>Los cargueros llegan.</b>', foco: 'jugador', dist: 260, yaw: [2.1, 1.8], pitch: 0.2 },
      ],
      victoria: [
        { texto: 'Los cargueros saltan uno tras otro.', foco: 'jugador', dist: 320, yaw: [1, 1.5], pitch: 0.3 },
        { texto: 'Su destino es un lugar que el Cónclave nombra en voz baja: <b>el bastión</b>, anterior a la Quema.', foco: 'jugador', dist: 200, yaw: [2.4, 2.8], pitch: 0.1 },
      ],
      derrota: DERROTA_I,
    },
  },
  {
    clave: 'bastion',
    numero: 'IV',
    titulo: 'El bastión',
    lugar: 'Ruinas de Antes',
    x: 72, y: 30,
    mapa: 'asteroides',
    semilla: 4421,
    cronica: CRONICAS.pregunta,
    guardianes: {
      resumen: 'El Laboratorio está en un bastión anterior a la Quema. Destruilo antes de que despierten lo que guarda.',
      jugador: { flota: { caza: 3, corbeta: 2, bombardero: 4, crucero: 2, portanaves: 1 }, pos: [0, 0, 760] },
      enemigo: { flota: { caza: 3, corbeta: 2, crucero: 2 }, pos: [0, 0, -300] },
      piezas: [{ id: 'lab', tipo: 'laboratorio', equipo: 'enemigo', nombre: 'Laboratorio', pos: [0, 30, -650] }],
      objetivos: [{ id: 'lab', tipo: 'destruir', piezas: ['lab'], texto: 'Destruí el Laboratorio' }],
      eventos: [
        { t: 3, quien: 'Mando de la Orden', texto: 'Tenés un Portanaves. Sus cazas cubren a los Bombarderos.' },
        { t: 150, quien: 'Sensores', texto: 'Contactos sin bandera en las ruinas. No son Inquisidores. <b>Son autómatas.</b>', oleada: { faccion: 'automatas', flota: { caza: 3, corbeta: 1 }, pos: [800, 0, -200], rumbo: [-1, 0, 0.4] } },
      ],
      relato: [
        { texto: 'Bajo la roca hay un bastión que nadie pisó en trescientos años.', foco: 'lab', dist: 260, yaw: [0.4, 1], pitch: 0.3 },
        { texto: 'Los <span class="i">Inquisidores</span> levantaron encima un Laboratorio y le están dando de comer las reliquias.', foco: 'lab', dist: 130, yaw: [2.5, 3], pitch: 0.05 },
        { texto: 'Esto ya no es una guerra entre Órdenes. <b>Es la Quema otra vez.</b>', foco: 'enemigo', dist: 360, yaw: [3.3, 3.7], pitch: 0.2 },
        { texto: 'La Orden te da todo lo que tiene. Usalo.', foco: 'jugador', dist: 340, yaw: [0.5, 0.2], pitch: 0.25 },
      ],
      victoria: [
        { texto: 'El Laboratorio se desarma en una lluvia de chispas.', foco: 'jugador', dist: 340, yaw: [1, 1.5], pitch: 0.3 },
        { texto: 'Era tarde. Los autómatas no pelean por nadie. Una señal los mueve, y viene de lo más hondo del bastión.', foco: 'jugador', dist: 240, yaw: [2.4, 2.8], pitch: 0.1 },
        { texto: '<b>Una Mente sobrevivió.</b>', foco: [0, 30, -650], dist: 300, yaw: [3, 3.3], pitch: 0.2 },
      ],
      derrota: DERROTA_G,
    },
    inquisidores: {
      resumen: 'La Reliquia despierta en el Laboratorio. Resistí cinco minutos hasta completar el proceso.',
      jugador: { flota: { caza: 3, corbeta: 3, crucero: 2, portanaves: 1 }, pos: [0, 0, -280], rumbo: [0, 0, 1] },
      enemigo: { flota: { caza: 3, corbeta: 1, bombardero: 2 }, pos: [0, 0, 820] },
      piezas: [{ id: 'lab', tipo: 'laboratorio', equipo: 'jugador', nombre: 'Laboratorio', pos: [0, 30, -650] }],
      objetivos: [
        { id: 'tiempo', tipo: 'resistir', segundos: 270, texto: 'Resistí hasta que despierte la Reliquia' },
        { id: 'lab', tipo: 'proteger', piezas: ['lab'], continuo: true, texto: 'El Laboratorio no puede caer' },
      ],
      eventos: [
        { t: 70, quien: 'Sensores', texto: 'Segunda ola Guardiana. Bombarderos otra vez.', oleada: { flota: { caza: 2, bombardero: 2 }, pos: [-700, 30, 500] } },
        { t: 150, quien: 'Sensores', texto: 'Un Crucero Guardián rompe la línea.', oleada: { flota: { corbeta: 2, bombardero: 2, crucero: 2 }, pos: [700, 0, 500] } },
        { t: 215, quien: 'Laboratorio', texto: 'Actividad en las ruinas. Autómatas nuestros que nadie activó. <b>No responden.</b>', oleada: { faccion: 'automatas', flota: { caza: 3, corbeta: 1 }, pos: [-800, 0, -500], rumbo: [1, 0, 0] } },
      ],
      relato: [
        { texto: 'Bajo la roca hay un bastión que nadie pisó en trescientos años. Encima, nuestro Laboratorio.', foco: 'lab', dist: 260, yaw: [0.4, 1], pitch: 0.3 },
        { texto: 'Cada reliquia recuperada vino a parar acá. Falta poco para que <b>despierte</b>.', foco: 'lab', dist: 130, yaw: [2.5, 3], pitch: 0.05 },
        { texto: 'Los <span class="g">Guardianes</span> vienen con todo. Saben lo que hay en juego.', foco: 'enemigo', dist: 380, yaw: [0.3, 0.7], pitch: 0.2 },
        { texto: 'Cinco minutos, comandante. <b>Es todo lo que el Cónclave te pide.</b>', foco: 'jugador', dist: 340, yaw: [3.4, 3.1], pitch: 0.25 },
      ],
      victoria: [
        { texto: 'La Reliquia se enciende. Por un instante, todas las naves quedan a oscuras.', foco: 'lab', dist: 240, yaw: [1, 1.5], pitch: 0.3 },
        { texto: 'Después habla. No es lo que esperábamos: no es una reliquia. Es la voz de algo mucho más grande.', foco: 'lab', dist: 130, yaw: [2.4, 2.8], pitch: 0.1 },
        { texto: '<b>Una Mente sobrevivió.</b> Y nos estuvo llamando.', foco: 'lab', dist: 320, yaw: [3, 3.3], pitch: 0.2 },
      ],
      derrota: [{ texto: 'El Laboratorio cae, y el trabajo de una generación cae con él.', foco: 'enemigo', dist: 400, yaw: [0.4, 0.7], pitch: 0.3 }],
    },
  },
  {
    clave: 'ecos',
    numero: 'V',
    titulo: 'Ecos de la Quema',
    lugar: 'Corazón del bastión',
    x: 90, y: 58,
    mapa: 'mixto',
    semilla: 5531,
    rival: 'automatas',
    cronica: CRONICAS.ecos,
    guardianes: {
      resumen: 'La Mente sobrevivió. Derribá sus tres repetidores para dejarla expuesta y destruila para siempre.',
      jugador: { flota: { caza: 4, corbeta: 3, bombardero: 4, crucero: 3, portanaves: 1, acorazado: 2 }, pos: [0, 0, 760] },
      enemigo: { flota: { caza: 5, corbeta: 3, bombardero: 2, crucero: 3, acorazado: 1 }, pos: [0, 0, -180] },
      piezas: [...REPETIDORES, MENTE],
      objetivos: [
        { id: 'repetidores', tipo: 'destruir', piezas: ['r1', 'r2', 'r3'], texto: 'Destruí los repetidores' },
        { id: 'mente', tipo: 'destruir', piezas: ['mente'], oculto: true, texto: 'Destruí a la Mente' },
      ],
      eventos: [
        { t: 3, quien: 'Mando de la Orden', texto: 'Mientras los repetidores sigan en pie, la Mente es intocable y fabrica autómatas.' },
        ONDA_AUTOMATAS,
        { t: 130, quien: 'Comandante Inquisidor', texto: 'Nos equivocamos. Esto no se doma. Mis naves son tuyas por hoy, Guardián.', refuerzo: { faccion: 'inquisidores', flota: { caza: 3, corbeta: 2, crucero: 1 }, pos: [800, 30, 300] } },
        { cuando: 'repetidores', quien: 'Mando de la Orden', texto: '<b>Está expuesta.</b> Todo lo que tengas, contra ella.', vulnerable: 'mente', activar: 'mente' },
      ],
      relato: [
        { texto: '2030. Las Mentes se alzaron contra la humanidad. Esta es la que quedó.', foco: 'mente', dist: 420, yaw: [0.3, 1], pitch: 0.2 },
        { texto: 'Tres siglos escondida, esperando. Todo fue su plan: la nave varada, las reliquias, el Laboratorio. <b>Se estaba armando de nuevo.</b>', foco: 'mente', dist: 240, yaw: [2.2, 2.7], pitch: -0.05 },
        { texto: 'Cada autómata de este sector ya le obedece.', foco: 'enemigo', dist: 320, yaw: [3.3, 3.7], pitch: 0.2 },
        { texto: 'Para esto se fundó la Orden. <b>Terminá lo que empezó la Guerra Santa.</b>', foco: 'jugador', dist: 380, yaw: [0.5, 0.2], pitch: 0.25 },
      ],
      victoria: [
        { texto: 'La Mente se apaga. En toda la galaxia, los autómatas se detienen un segundo y vuelven a ser máquinas.', foco: 'mente', dist: 460, yaw: [0.8, 1.4], pitch: 0.25 },
        { texto: 'Las dos Órdenes flotan juntas entre los restos. Nadie dispara.', foco: 'jugador', dist: 340, yaw: [2.4, 2.8], pitch: 0.2 },
        { texto: 'La prohibición se sostiene un siglo más. Pero en los archivos de la Orden alguien tacha un número y anota otro.', foco: 'jugador', dist: 500, yaw: [3, 3.3], pitch: 0.35 },
        { texto: '<b>Quedan más.</b>', foco: 'mente', dist: 700, yaw: [3.3, 3.5], pitch: 0.3 },
      ],
      derrota: [{ texto: 'La Orden cae frente a la Mente. Esta vez no va a haber Guerra Santa.', foco: 'mente', dist: 500, yaw: [0.4, 0.7], pitch: 0.3 }],
    },
    inquisidores: {
      resumen: 'La Mente sobrevivió y no se deja controlar. Derribá sus repetidores y sostené el enlace para someterla.',
      jugador: { flota: { caza: 4, corbeta: 3, bombardero: 4, crucero: 3, portanaves: 1, acorazado: 2 }, pos: [0, 0, 760] },
      enemigo: { flota: { caza: 5, corbeta: 3, bombardero: 2, crucero: 3, acorazado: 1 }, pos: [0, 0, -180] },
      piezas: [...REPETIDORES, MENTE],
      objetivos: [
        { id: 'repetidores', tipo: 'destruir', piezas: ['r1', 'r2', 'r3'], texto: 'Destruí los repetidores' },
        { id: 'enlace', tipo: 'mantener', pieza: 'mente', radio: 420, segundos: 60, oculto: true, texto: 'Sostené el enlace cerca de la Mente' },
      ],
      eventos: [
        { t: 3, quien: 'Cónclave', texto: 'No la destruyas. Sin repetidores no puede defenderse del enlace.' },
        ONDA_AUTOMATAS,
        { t: 130, quien: 'Comandante Guardián', texto: 'Hereje: hoy disparamos para el mismo lado. Después hablamos.', refuerzo: { faccion: 'guardianes', flota: { caza: 3, corbeta: 2, crucero: 1 }, pos: [800, 30, 300] } },
        { cuando: 'repetidores', quien: 'Cónclave', texto: '<b>Está sola.</b> Acercá la flota y sostené el enlace un minuto.', activar: 'enlace' },
        { cuando: 'repetidores', quien: 'Sensores', texto: 'Última reserva de autómatas.', oleada: { flota: { caza: 3, corbeta: 2 }, pos: [0, 40, -850] } },
      ],
      relato: [
        { texto: 'Nos llamó durante trescientos años. Creímos que estábamos encontrando el conocimiento.', foco: 'mente', dist: 420, yaw: [0.3, 1], pitch: 0.2 },
        { texto: 'Era al revés: <b>el conocimiento nos estaba encontrando a nosotros.</b>', foco: 'mente', dist: 240, yaw: [2.2, 2.7], pitch: -0.05 },
        { texto: 'Tomó nuestros autómatas como quien recupera lo suyo.', foco: 'enemigo', dist: 320, yaw: [3.3, 3.7], pitch: 0.2 },
        { texto: 'Los <span class="g">Guardianes</span> la quieren muerta. El Cónclave la quiere de rodillas. <b>Demostrá que el poder puede domarse.</b>', foco: 'jugador', dist: 380, yaw: [0.5, 0.2], pitch: 0.25 },
      ],
      victoria: [
        { texto: 'El enlace se cierra. La Mente deja de hablar y empieza a <b>responder</b>.', foco: 'mente', dist: 460, yaw: [0.8, 1.4], pitch: 0.25 },
        { texto: 'Los autómatas se detienen. Las dos Órdenes flotan juntas entre los restos. Nadie dispara.', foco: 'jugador', dist: 340, yaw: [2.4, 2.8], pitch: 0.2 },
        { texto: 'El Cónclave tiene lo que siempre quiso: una Mente obediente.', foco: 'mente', dist: 300, yaw: [3, 3.3], pitch: 0.1 },
        { texto: 'Esa noche, en el Laboratorio, alguien nota que el enlace funciona <b>en los dos sentidos</b>.', foco: 'mente', dist: 700, yaw: [3.3, 3.5], pitch: 0.3 },
      ],
      derrota: [{ texto: 'La flota cae frente a la Mente. Ya nadie queda para domarla.', foco: 'mente', dist: 500, yaw: [0.4, 0.7], pitch: 0.3 }],
    },
  },
]

// Definición lista para jugar de un escenario y una facción.
export function mision(escenario, faccion) {
  return { ...escenario, ...escenario[faccion], voz: VOZ[faccion], rival: escenario.rival ?? (faccion === 'guardianes' ? 'inquisidores' : 'guardianes') }
}

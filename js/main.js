// Punto de entrada: arma el motor, maneja las pantallas y corre el ciclo
// de la batalla (simulación → efectos → dibujo → HUD).
import * as THREE from 'three'
import { crearEscena } from './motor/escena.js'
import { cargarModelos, plantilla, crearMallaNave } from './motor/modelos.js'
import { CamaraOrbital } from './motor/camara.js'
import { Particulas, Proyectiles, Motores, Escudos, Ondas, COLOR_ESCUDO, COLOR_FUEGO, COLOR_HUMO, COLOR_FLAK, COLOR_DESTELLO } from './motor/efectos.js'
import { Sonido } from './motor/sonido.js'
import { Musica } from './motor/musica.js'
import { Intro } from './ui/intro.js'
import { Batalla, JUGADOR, ENEMIGO } from './sim/batalla.js'
import { ComandanteIA } from './sim/ia.js'
import { Terreno, MAPAS } from './sim/terreno.js'
import { armarInforme } from './sim/informe.js'
import { Cuenta } from './red/cuenta.js'
import { Salon } from './ui/salon.js'
import { Multijugador } from './ui/multijugador.js'
import { SincroAnfitrion, BatallaRemota, describirBatalla } from './red/partida.js'
import { Terreno3D } from './motor/terreno3d.js'
import { Tutorial, tutorialVisto } from './ui/tutorial.js'
import { Entrada } from './entrada.js'
import { Tactil, ES_TACTIL } from './tactil.js'
import { Hud } from './ui/hud.js'
import { Menus, mostrarPantalla } from './ui/menus.js'
import { FACCIONES, TIPOS, ORDEN_TIPOS, DIFICULTADES } from './datos.js'

const contenedor = document.getElementById('juego')
// En celulares y tablets se arranca en calidad liviana (se puede cambiar).
if (ES_TACTIL) document.documentElement.classList.add('tactil')
const calidadInicial = (() => {
  try {
    return localStorage.getItem('calidad') ?? (ES_TACTIL ? 'baja' : 'alta')
  } catch {
    return ES_TACTIL ? 'baja' : 'alta'
  }
})()
const { renderer, escena, camara, fondo } = crearEscena(contenedor, calidadInicial)
const orbital = new CamaraOrbital(camara, renderer.domElement)
orbital.dist = orbital.distDeseada = 900

function escalaPuntos() {
  return renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)))
}
const particulas = new Particulas(escena, calidadInicial === 'baja' ? 2500 : 5000, escalaPuntos())
const proyectiles = new Proyectiles(escena, 4000)
const motores = new Motores(escena, 1000, escalaPuntos())
const escudos = new Escudos(escena, 24)
const ondas = new Ondas(escena, 12)
const sonido = new Sonido()
const musica = new Musica(sonido)
const cuenta = new Cuenta()
const salon = new Salon(cuenta)
cuenta.iniciar()
const ESTELAS = calidadInicial === 'baja' ? 0.5 : 1 // fracción de cuadros que emiten estela
window.addEventListener('resize', () => {
  particulas.puntos.material.uniforms.escala.value = escalaPuntos()
  motores.puntos.material.uniforms.escala.value = escalaPuntos()
})

// Grilla de la vista de sensores.
const grilla = new THREE.PolarGridHelper(4000, 16, 10, 96, 0x2a5a78, 0x173246)
grilla.material.transparent = true
grilla.material.opacity = 0.45
grilla.visible = false
escena.add(grilla)

let partida = null // { batalla, ia, entrada, hud, config, mallas }
let pausa = false

const menus = new Menus({
  alCombatir: (config) => iniciarBatalla(config),
  alAbrirAyuda: (enBatalla) => abrirAyuda(enBatalla),
  faccionFija: () => cuenta.perfil?.faccion ?? null,
  // Batalla chica y fácil, con el tutorial desde el primer paso.
  alTutorial: () =>
    iniciarBatalla(
      { ...menus.config, presupuesto: 2500, dificultad: 'facil', mapa: 'mixto', flota: { caza: 2, corbeta: 1, bombardero: 1, crucero: 1, acorazado: 0 } },
      { tutorial: true },
    ),
})

const multijugador = new Multijugador({
  menus,
  cuenta,
  salon,
  alIniciar: (rol, canal, datos) =>
    rol === 'anfitrion'
      ? iniciarBatalla(datos.config, { red: { rol, canal, flotaRival: datos.flotaRival, faccionRival: datos.faccionRival, nombreRival: datos.nombreRival } })
      : iniciarBatalla(datos.config, { red: { rol, canal, descripcion: datos.descripcion } }),
})
menus.alSalirMulti = () => multijugador.salir(true)

const intro = new Intro({
  musica,
  alComenzar: () => {
    // En teléfonos: pantalla completa y orientación horizontal fija. Solo
    // Android lo permite (y solo con pantalla completa); en iPhone queda el
    // aviso de girar el teléfono.
    if (ES_TACTIL && Math.min(screen.width, screen.height) < 600)
      document.documentElement
        .requestFullscreen?.({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {})
    sonido.iniciar()
    sonido.escala = 0.3 // en la portada los efectos quedan de fondo de la música
  },
})

let modelosListos = false
cargarModelos((f) => menus.progreso(f))
  .then(() => {
    modelosListos = true
    menus.cargaLista()
    intro.listo()
  })
  .catch((err) => {
    console.error(err)
    document.getElementById('carga-texto').textContent =
      'No se pudieron cargar los modelos. Abrí el juego con iniciar.command / iniciar.bat (necesita un servidor local).'
  })

// --- Ayuda / pausa -----------------------------------------------------------

function abrirAyuda(enBatalla) {
  document.getElementById('ayuda').classList.add('visible')
  document.getElementById('btn-abandonar').hidden = !enBatalla
  document.getElementById('ayuda-titulo').textContent = enBatalla ? 'Pausa · Controles' : 'Controles'
  if (enBatalla) pausa = true
}
function cerrarAyuda() {
  document.getElementById('ayuda').classList.remove('visible')
  pausa = false
}
document.body.addEventListener('click', (e) => {
  const a = e.target.closest('[data-accion]')?.dataset.accion
  if (a === 'cerrar-ayuda') cerrarAyuda()
  if (a === 'abandonar') {
    cerrarAyuda()
    if (partida?.red) {
      // Abandonar una batalla en red es rendirse.
      partida.red.canal.enviar('rendicion', {})
      multijugador.terminar()
    }
    terminarBatalla()
    mostrarPantalla('pantalla-titulo')
  }
  if (a === 'pausa' && partida) abrirAyuda(true)
  if (a === 'sensores' && partida) alternarSensores()
  if (a === 'pausa-tactica' && partida) alternarPausaTactica()
  if (a === 'ver-flota') document.body.classList.toggle('ver-flota')
  if (a === 'pantalla-completa') {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }
  if (a === 'velocidad' && partida) alternarVelocidad()
  if (a === 'panel-sonido') alternarPanelSonido(e.target.closest('[data-accion]'))
  else if (!e.target.closest('#panel-sonido')) cerrarPanelSonido()
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('ayuda').classList.contains('visible')) {
    e.stopImmediatePropagation()
    cerrarAyuda()
  }
}, true)
document.getElementById('hud-comandos').addEventListener('click', (e) => {
  const b = e.target.closest('.btn')
  if (!b || !partida) return
  const en = partida.entrada
  // Botones extra de la pantalla táctil.
  if (b.dataset.cmd === 'todos') return en.seleccionar(partida.batalla.batallones.filter((x) => x.equipo === JUGADOR))
  if (b.dataset.cmd === 'ninguno') return en.seleccionar([])
  if (b.dataset.cmd === 'subir' || b.dataset.cmd === 'bajar') return partida.tactil.cambiarAltura(b.dataset.cmd === 'subir' ? 1 : -1)
  en.comando({ cmd: b.dataset.cmd, formacion: b.dataset.formacion, tactica: b.dataset.tactica })
})

// --- Panel de sonido ---------------------------------------------------------
// Música y efectos por separado, más "silenciar todo". Se abre desde la barra
// de la batalla, el botón flotante de los menús o el menú de pausa.

const panelSonido = document.getElementById('panel-sonido')

function alternarPanelSonido(boton) {
  if (!panelSonido.hidden) return cerrarPanelSonido()
  refrescarPanelSonido()
  panelSonido.hidden = false
  // Se ubica debajo del botón que lo abrió.
  const r = boton.getBoundingClientRect()
  panelSonido.style.top = `${Math.min(r.bottom + 6, innerHeight - panelSonido.offsetHeight - 8)}px`
  panelSonido.style.left = `${Math.max(8, Math.min(r.right - panelSonido.offsetWidth, innerWidth - panelSonido.offsetWidth - 8))}px`
}

function cerrarPanelSonido() {
  panelSonido.hidden = true
}

function refrescarPanelSonido() {
  for (const canal of ['musica', 'efectos']) {
    const v = Math.round(sonido.volumenes[canal] * 100)
    document.getElementById(`vol-${canal}`).value = v
    document.getElementById(`val-${canal}`).textContent = `${v}%`
  }
  const silencio = document.getElementById('btn-silencio')
  silencio.textContent = sonido.activo ? 'Silenciar todo' : 'Activar sonido'
  silencio.classList.toggle('activo', !sonido.activo)
  for (const id of ['btn-sonido', 'btn-sonido-menu']) document.getElementById(id).classList.toggle('silenciado', !sonido.activo)
}

for (const canal of ['musica', 'efectos'])
  document.getElementById(`vol-${canal}`).addEventListener('input', (e) => {
    sonido.cambiarVolumen(canal, Number(e.target.value) / 100)
    document.getElementById(`val-${canal}`).textContent = `${e.target.value}%`
  })
document.getElementById('btn-silencio').addEventListener('click', () => {
  sonido.iniciar()
  sonido.alternar()
  refrescarPanelSonido()
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panelSonido.hidden) {
    e.stopImmediatePropagation()
    cerrarPanelSonido()
  } else if (e.key === 'Escape' && document.getElementById('pantalla-cuenta').classList.contains('visible')) {
    e.stopImmediatePropagation()
    salon.cerrarCuenta()
  }
}, true)
refrescarPanelSonido()

// --- Armado de la batalla ----------------------------------------------------

function flotaEnemiga(dificultad, presupuestoBase) {
  const presupuesto = presupuestoBase * DIFICULTADES[dificultad].presupuesto
  const flota = Object.fromEntries(ORDEN_TIPOS.map((k) => [k, 0]))
  // Base pareja: un poco de todo, después al azar hasta gastar el presupuesto.
  let resto = presupuesto
  for (const k of ['caza', 'bombardero', 'crucero', 'corbeta']) {
    if (resto >= TIPOS[k].costo) {
      flota[k]++
      resto -= TIPOS[k].costo
    }
  }
  const pesos = { caza: 3, corbeta: 2, bombardero: 2, crucero: 1.2, acorazado: 0.7 }
  for (let intentos = 0; intentos < 400; intentos++) {
    const posibles = ORDEN_TIPOS.filter((k) => TIPOS[k].costo <= resto)
    if (!posibles.length) break
    const total = posibles.reduce((s, k) => s + pesos[k], 0)
    let r = Math.random() * total
    const k = posibles.find((x) => (r -= pesos[x]) <= 0) ?? posibles[0]
    flota[k]++
    resto -= TIPOS[k].costo
  }
  return flota
}

function desplegar(batalla, equipo, flota) {
  const lado = equipo === JUGADOR ? 1 : -1
  const rumbo = new THREE.Vector3(0, 0, -lado)
  // Filas: cazas adelante, capitales atrás.
  const filas = { caza: 0, corbeta: 0, bombardero: 1, crucero: 2, acorazado: 3 }
  const porFila = [[], [], [], []]
  for (const k of ORDEN_TIPOS) for (let i = 0; i < flota[k]; i++) porFila[filas[k]].push(k)
  const batallones = []
  porFila.forEach((fila, f) => {
    const separacion = f >= 2 ? 160 : 90
    // Flotas grandes: hasta 8 por fila; el resto en capas arriba, abajo y atrás.
    const ancho = Math.min(fila.length, 8)
    fila.forEach((k, i) => {
      const col = i % 8
      const capa = Math.floor(i / 8)
      const x = (col - (ancho - 1) / 2) * separacion
      const y = (capa % 2 ? 1 : -1) * Math.ceil(capa / 2) * separacion * 0.6
      const centro = new THREE.Vector3(x, y + (Math.random() - 0.5) * 40 + (f === 3 ? -20 : 0), lado * (750 + f * 120 + capa * 40))
      batallones.push(batalla.agregarBatallon(equipo, k, centro, rumbo))
    })
  })
  return batallones
}

function alternarPausaTactica() {
  partida.pausaTactica = !partida.pausaTactica
  partida.hud.estadoTiempo(partida.pausaTactica, partida.velocidad)
  partida.tutorial?.notificar('pausaTactica')
}

function alternarVelocidad() {
  partida.velocidad = partida.velocidad === 1 ? 2 : 1
  partida.hud.estadoTiempo(partida.pausaTactica, partida.velocidad)
}

function iniciarBatalla(config, opciones = {}) {
  terminarBatalla()
  terminarEscaparate()
  musica.detener()
  sonido.escala = 1
  orbital.suavidad = 6
  sonido.iniciar()
  sonido.ambiente(true)
  refrescarPanelSonido()
  document.getElementById('btn-sonido-menu').hidden = true
  document.getElementById('btn-cuenta').hidden = true
  // Multijugador: el anfitrión simula; el invitado reconstruye la batalla
  // que le describe el anfitrión y solo la reproduce (ver red/partida.js).
  const red = opciones.red
  const invitado = red?.rol === 'invitado'
  let batalla, terreno, faccionEnemiga, flotaRival
  if (invitado) {
    batalla = new BatallaRemota({ descripcion: red.descripcion, plantilla, crearMalla: crearMallaNave, canal: red.canal })
    terreno = batalla.terreno
    faccionEnemiga = batalla.facciones[ENEMIGO]
  } else {
    faccionEnemiga = red ? red.faccionRival : config.faccion === 'guardianes' ? 'inquisidores' : 'guardianes'
    flotaRival = red ? red.flotaRival : flotaEnemiga(config.dificultad, config.presupuesto)
    const tipoMapa = config.mapa in MAPAS ? config.mapa : Object.keys(MAPAS)[Math.floor(Math.random() * 4)]
    // El terreno se estira con el tamaño de las flotas.
    const batallonesMax = Math.max(...[config.flota, flotaRival].map((f) => Object.values(f).reduce((a, b) => a + b, 0)))
    terreno = new Terreno(tipoMapa, THREE.MathUtils.clamp(batallonesMax / 14, 1, 1.8))
    batalla = new Batalla({
      faccionJugador: config.faccion,
      faccionEnemiga,
      plantilla,
      crearMalla: crearMallaNave,
      terreno,
    })
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.calidad === 'baja' ? 1 : 1.5))
  renderer.setSize(contenedor.clientWidth, contenedor.clientHeight)
  particulas.puntos.material.uniforms.escala.value = escalaPuntos()
  motores.puntos.material.uniforms.escala.value = escalaPuntos()

  let propios
  if (invitado) propios = batalla.batallones.filter((b) => b.equipo === JUGADOR)
  else {
    propios = desplegar(batalla, JUGADOR, config.flota)
    desplegar(batalla, ENEMIGO, flotaRival)
  }
  const terreno3d = new Terreno3D(escena, terreno)
  for (const n of batalla.naves) escena.add(n.malla)

  // En multijugador el otro bando lo maneja una persona, no la IA.
  const ia = red ? { actualizar() {}, esperando: false } : new ComandanteIA(batalla, config.dificultad)
  let hud = null
  const entrada = new Entrada({
    elemento: renderer.domElement,
    camara,
    orbital,
    batalla,
    alCambiarSeleccion: () => hud?.refrescarSeleccion(),
    alAviso: (t, s) => hud?.aviso(t, s),
    alPausa: () => abrirAyuda(true),
    alSensores: () => alternarSensores(),
    alPausaTactica: () => !red && alternarPausaTactica(),
    alVelocidad: () => !red && alternarVelocidad(),
    alOrden: (evento) => partida?.tutorial?.notificar(evento),
  })
  hud = new Hud({ batalla, entrada, faccion: config.faccion, orbital })
  const tactil = new Tactil({ elemento: renderer.domElement, entrada, orbital })
  document.body.classList.add('en-batalla')
  partida = {
    batalla, ia, entrada, hud, config, terreno3d, tactil,
    fin: 0,
    pausaTactica: false,
    velocidad: 1,
    fps: { t: 0, n: 0, ajustado: config.calidad === 'baja' },
  }
  pausa = false
  if (!red && (opciones.tutorial || !tutorialVisto())) partida.tutorial = new Tutorial({ orbital, ia })
  partida.esTutorial = !!opciones.tutorial
  partida.red = red
  // En red no hay pausa táctica ni velocidad ×2: el tiempo es el mismo para los dos.
  document.getElementById('btn-pausa-tactica').hidden = !!red
  document.getElementById('btn-velocidad').hidden = !!red
  if (red) {
    if (!invitado) {
      red.canal.enviar('inicio', describirBatalla(batalla, config))
      partida.sincro = new SincroAnfitrion(batalla, red.canal)
    }
    const ganarPor = (motivo) => {
      if (partida?.red !== red || batalla.terminada) return
      batalla.terminada = 'victoria'
      hud.registrar(motivo, 'bueno')
    }
    red.canal.al('rendicion', () => ganarPor('Tu rival se rindió.'))
    red.canal.alSalirRival(() => ganarPor('Tu rival se desconectó.'))
  }

  // Cámara detrás de la flota propia, mirando hacia el enemigo.
  const centro = new THREE.Vector3()
  for (const b of propios) centro.add(b.centro(new THREE.Vector3()))
  centro.divideScalar(propios.length)
  orbital.foco.copy(centro)
  orbital.focoDeseado.copy(centro)
  orbital.yaw = 0.35
  orbital.pitch = 0.32
  orbital.dist = 900
  orbital.distDeseada = 380
  orbital.seguir = null
  entrada.seleccionar(propios)

  for (const p of document.querySelectorAll('.pantalla')) p.classList.remove('visible')
  hud.registrar(
    red
      ? `Batalla contra ${red.nombreRival ?? 'tu rival'} (${FACCIONES[faccionEnemiga].nombre}). Que gane el mejor comandante.`
      : `Flota ${FACCIONES[faccionEnemiga].nombre} detectada. A tus puestos, comandante.`,
  )
  hud.registrar(`Mapa: ${MAPAS[terreno.tipo].nombre}`)
}

function terminarBatalla() {
  if (!partida) return
  for (const n of partida.batalla.naves) if (n.malla) escena.remove(n.malla)
  partida.entrada.destruir()
  partida.tactil.destruir()
  document.body.classList.remove('en-batalla', 'ver-flota', 'modo-mover')
  partida.terreno3d.destruir()
  partida.tutorial?.destruir()
  sonido.ambiente(false)
  partida.hud.destruir()
  partida = null
  document.getElementById('btn-sonido-menu').hidden = false
  document.getElementById('btn-cuenta').hidden = false
  proyectiles.dibujar([])
  motores.dibujar([])
  if (sensores.activo) alternarSensores()
}

const sensores = { activo: false, antes: null }
function alternarSensores() {
  if (!partida) return
  sensores.activo = !sensores.activo
  partida.hud.sensores = sensores.activo
  grilla.visible = sensores.activo
  if (sensores.activo) {
    sensores.antes = { dist: orbital.distDeseada, pitch: orbital.pitch }
    orbital.distDeseada = 4200
    orbital.pitch = 1.05
    const c = new THREE.Vector3()
    let k = 0
    for (const n of partida.batalla.naves) if (n.viva) (c.add(n.pos), k++)
    if (k) orbital.focoDeseado.copy(c.divideScalar(k))
    grilla.position.set(orbital.focoDeseado.x, orbital.focoDeseado.y - 150, orbital.focoDeseado.z)
    orbital.seguir = null
  } else if (sensores.antes) {
    orbital.distDeseada = sensores.antes.dist
    orbital.pitch = sensores.antes.pitch
  }
}

// --- Batalla de fondo de la portada -------------------------------------------
// Dos flotas manejadas por la IA pelean detrás de los menús. La cámara va
// cambiando de plano como en un tráiler: siguiendo una capital, metida entre
// cazas o abriendo para mostrar toda la batalla.

let escaparate = null

function iniciarEscaparate() {
  const facciones = Math.random() < 0.5 ? ['guardianes', 'inquisidores'] : ['inquisidores', 'guardianes']
  const tipoMapa = ['mixto', 'asteroides', 'nebulosa', 'abierto'][Math.floor(Math.random() * 4)]
  const terreno = new Terreno(tipoMapa, 1)
  const batalla = new Batalla({ faccionJugador: facciones[0], faccionEnemiga: facciones[1], plantilla, crearMalla: crearMallaNave, terreno })
  desplegar(batalla, JUGADOR, flotaEnemiga('normal', 5000))
  desplegar(batalla, ENEMIGO, flotaEnemiga('normal', 5000))
  for (const n of batalla.naves) escena.add(n.malla)
  escaparate = {
    batalla,
    ias: [new ComandanteIA(batalla, 'dificil', JUGADOR), new ComandanteIA(batalla, 'dificil', ENEMIGO)],
    terreno3d: new Terreno3D(escena, terreno),
    plano: 0,
    fin: 0,
  }
  orbital.suavidad = 1.4
  orbital.foco.set(0, 0, 0)
  orbital.focoDeseado.set(0, 0, 0)
  orbital.dist = orbital.distDeseada = 1800
  orbital.pitch = 0.35
  // Arranca con la flota avanzando un poco, para que haya acción enseguida.
  for (let i = 0; i < 300; i++) {
    batalla.paso(PASO)
    for (const ia of escaparate.ias) ia.actualizar(PASO)
  }
  batalla.eventos.length = 0
  if (sonido.ctx && !musica.activa && document.getElementById('pantalla-titulo').classList.contains('visible')) musica.iniciar()
}

function terminarEscaparate() {
  if (!escaparate) return
  for (const n of escaparate.batalla.naves) if (n.malla) escena.remove(n.malla)
  escaparate.terreno3d.destruir()
  escaparate = null
  proyectiles.dibujar([])
  motores.dibujar([])
}

function actualizarEscaparate(dt) {
  const e = escaparate
  const b = e.batalla
  const pasos = Math.ceil(dt / PASO)
  for (let i = 0; i < pasos; i++) b.paso(dt / pasos)
  for (const ia of e.ias) ia.actualizar(dt)
  procesarEventos(b)
  sincronizarNaves(b, dt, true)
  particulas.actualizar(dt)
  escudos.actualizar(dt)
  ondas.actualizar(dt)
  e.terreno3d.actualizar(dt)
  for (const pr of b.proyectiles)
    if (pr.tipo === 'torpedo') particulas.emitir(pr.pos, _n.set(0, 0, 0), COLOR_ESTELA_TORPEDO, 3, 0.9, 1.5)
  proyectiles.dibujar(b.proyectiles)
  motores.dibujar(b.naves)
  if (b.terminada) {
    e.fin += dt
    if (e.fin > 5) {
      terminarEscaparate()
      return
    }
  }
  // Planos de cámara.
  e.plano -= dt
  orbital.yaw += dt * 0.05
  if (e.plano <= 0) {
    e.plano = 7 + Math.random() * 4
    const vivas = b.naves.filter((n) => n.viva)
    if (!vivas.length) return
    const capitales = vivas.filter((n) => n.esCapital)
    const tiro = Math.random()
    if (tiro < 0.4 && capitales.length) {
      const c = capitales[Math.floor(Math.random() * capitales.length)]
      orbital.seguir = () => (c.viva ? c.pos : null)
      orbital.distDeseada = c.radio * (4 + Math.random() * 3)
      orbital.pitch = 0.1 + Math.random() * 0.3
    } else if (tiro < 0.75) {
      // Entre los cazas, donde está la pelea.
      const chicas = vivas.filter((n) => !n.esCapital && n.objetivo?.viva)
      const n = chicas[Math.floor(Math.random() * chicas.length)] ?? vivas[0]
      orbital.seguir = () => (n.viva ? n.pos : null)
      orbital.distDeseada = 90 + Math.random() * 80
      orbital.pitch = (Math.random() - 0.3) * 0.5
    } else {
      // Plano general.
      const c = new THREE.Vector3()
      for (const n of vivas) c.add(n.pos)
      c.divideScalar(vivas.length)
      orbital.seguir = null
      orbital.focoDeseado.copy(c)
      orbital.distDeseada = 1100 + Math.random() * 500
      orbital.pitch = 0.3 + Math.random() * 0.25
    }
    orbital.yaw += (Math.random() - 0.5) * 1.5
  }
}

// --- Efectos a partir de los eventos de la simulación ------------------------

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const colorDisparo = new THREE.Color()
const COLOR_ESTELA_TORPEDO = new THREE.Color(0.5, 0.3, 0.12)
const COLOR_POLVO = new THREE.Color(0.45, 0.38, 0.3)
const COLOR_FRAGMENTO = new THREE.Color(0.5, 0.42, 0.33)
const COLOR_NUBE_POLVO = new THREE.Color(0.16, 0.13, 0.1)

function procesarEventos(batalla) {
  for (const ev of batalla.eventos) {
    if (ev.tipo === 'disparo') {
      colorDisparo.set(FACCIONES[batalla.facciones[ev.equipo]].disparo)
      particulas.emitir(ev.pos, _v.set(0, 0, 0), colorDisparo, ev.arma === 'cañon' ? 16 : ev.arma === 'torpedo' ? 8 : 4, 0.08)
      sonido.reproducir(ev.arma, ev.pos, camara)
    } else if (ev.tipo === 'flak') {
      particulas.emitir(ev.pos, _v.set(0, 0, 0), COLOR_DESTELLO, 7, 0.12, 1)
      for (let i = 0; i < 4; i++)
        particulas.emitir(ev.pos, _v.randomDirection().multiplyScalar(6), COLOR_FLAK, 5 + Math.random() * 4, 0.6 + Math.random() * 0.5, 1.5)
      sonido.reproducir('flak', ev.pos, camara, 0.7)
    } else if (ev.tipo === 'impactoRoca') {
      particulas.chispas(ev.pos, _n.randomDirection(), COLOR_POLVO, 6, 25)
      if (ev.arma === 'torpedo' || ev.arma === 'cañon') particulas.explosion(ev.pos, 2, COLOR_FUEGO, 8)
      else particulas.emitir(ev.pos, _v.set(0, 0, 0), COLOR_POLVO, 6, 0.8, 1.5)
    } else if (ev.tipo === 'rocaDestruida') {
      const a = ev.asteroide
      // Polvo, brasas y fragmentos de roca que quedan flotando.
      particulas.explosion(a.pos, a.radio * 0.18, COLOR_POLVO, 40)
      for (let i = 0; i < 40; i++) {
        _v.randomDirection().multiplyScalar(a.radio * (0.3 + Math.random() * 0.9))
        particulas.emitir(_n.copy(a.pos).addScaledVector(_v, 0.5), _v, COLOR_FRAGMENTO, a.radio * (0.1 + Math.random() * 0.15), 4 + Math.random() * 3, -0.3)
      }
      // Nube de polvo que se expande lento.
      for (let i = 0; i < 24; i++) {
        _v.randomDirection().multiplyScalar(a.radio * (0.1 + Math.random() * 0.3))
        particulas.emitir(_n.copy(a.pos).addScaledVector(_v, 1.5), _v, COLOR_NUBE_POLVO, a.radio * (0.35 + Math.random() * 0.3), 3 + Math.random() * 2.5, 1.8)
      }
      sonido.reproducir('explosion', a.pos, camara, 1)
      orbital.sacudir(Math.max(0, 1 - a.pos.distanceTo(camara.position) / 1200) * a.radio * 0.15)
      partida?.hud.registrar('Un asteroide quedó hecho pedazos')
    } else if (ev.tipo === 'impacto') {
      const n = ev.nave
      _n.copy(ev.pos).sub(n.pos).normalize()
      if (ev.escudo) {
        escudos.destello(n, ev.pos, COLOR_ESCUDO)
        particulas.chispas(ev.pos, _n, COLOR_ESCUDO, 4, 30)
        sonido.reproducir('escudo', ev.pos, camara)
      } else {
        particulas.chispas(ev.pos, _n, COLOR_FUEGO, 8, 50)
        if (ev.arma === 'torpedo' || ev.arma === 'cañon') {
          particulas.explosion(ev.pos, 2, COLOR_FUEGO, 8)
          if (ev.arma === 'torpedo') ondas.lanzar(ev.pos, 18, COLOR_FUEGO, 0.5)
        }
        sonido.reproducir('impacto', ev.pos, camara)
      }
    } else if (ev.tipo === 'destruida') {
      const n = ev.nave
      if (n.esCapital) {
        particulas.explosion(n.pos, n.radio * 0.15, COLOR_FUEGO, 40)
        sonido.reproducir('explosion', n.pos, camara)
      } else {
        particulas.explosion(n.pos, n.radio * 0.6, COLOR_FUEGO, 36)
        sonido.reproducir('explosion', n.pos, camara, 0.6)
        escena.remove(n.malla)
        n.malla = null
      }
      partida?.entrada.limpiarMuertos()
    } else if (ev.tipo === 'batallonPerdido') {
      const b = ev.batallon
      if (b.equipo === JUGADOR) partida?.hud.registrar(`Perdimos el batallón ${b.nombre}`, 'malo')
      else partida?.hud.registrar(`Batallón enemigo ${b.nombre} destruido`, 'bueno')
    }
  }
  batalla.eventos.length = 0
}

function sincronizarNaves(batalla, dt, verTodo = false) {
  for (const n of batalla.naves) {
    const m = n.malla
    if (!m) continue
    // Las naves enemigas fuera de tus sensores no se dibujan.
    m.visible = verTodo || !n.viva || n.equipo === JUGADOR || batalla.esVisible(JUGADOR, n)
    m.position.copy(n.pos)
    m.quaternion.copy(n.quat)
    m.userData.cuerpo.rotation.z = n.alabeo
    if (n.viva) {
      // Estela de motor de las naves chicas.
      if (!n.esCapital && n.velocidad > 15 && Math.random() < ESTELAS) {
        _v.set(0, 0, n.cola).applyQuaternion(n.quat).add(n.pos)
        particulas.emitir(_v, _n.set(0, 0, 0), n.colorEstela ??= n.colorMotor.clone().multiplyScalar(0.35), n.radio * 0.5, 0.5, -0.6)
      }
      // Humo y fuego en naves muy dañadas.
      const daño = 1 - n.estructura / n.tipo.estructuraMax
      if (daño > 0.5 && Math.random() < dt * (n.esCapital ? 14 : 5) * daño) {
        _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(n.radio * 0.9).add(n.pos)
        particulas.emitir(_v, _n.set(0, 4, 0), Math.random() < 0.4 ? COLOR_FUEGO : COLOR_HUMO, n.radio * 0.6, 1.4, 2)
      }
    } else {
      // Capital destruida: deriva girando, explota por partes y al final estalla.
      if (Math.random() < dt * 8) {
        _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(n.radio * 1.4).add(n.pos)
        particulas.explosion(_v, n.radio * 0.13, COLOR_FUEGO, 14)
      }
      if (n.muerte > 3) {
        particulas.explosion(n.pos, n.radio * 0.5, COLOR_FUEGO, 120)
        ondas.lanzar(n.pos, n.radio * 6, COLOR_FUEGO, 1.6)
        ondas.lanzar(n.pos, n.radio * 4, COLOR_DESTELLO, 0.9)
        sonido.reproducir('grande', n.pos, camara)
        // Sacude la cámara si la explosión está cerca.
        orbital.sacudir(Math.max(0, 1 - n.pos.distanceTo(camara.position) / 1500) * n.radio * 0.25)
        escena.remove(m)
        n.malla = null
      }
    }
  }
}

// --- Ciclo principal ---------------------------------------------------------

const reloj = new THREE.Clock()
const PASO = 1 / 30

function cuadro() {
  requestAnimationFrame(cuadro)
  const dt = Math.min(reloj.getDelta(), 0.1)
  const p = partida
  if (p && !pausa) p.tutorial?.actualizar(dt)
  if (p && !pausa && !p.pausaTactica) {
    const dtJuego = dt * p.velocidad
    const pasos = Math.ceil(dtJuego / PASO)
    for (let i = 0; i < pasos; i++) p.batalla.paso(dtJuego / pasos)
    p.ia.actualizar(dtJuego)
    if (p.sincro) {
      p.sincro.recolectar()
      p.sincro.actualizar(dtJuego)
    }
    procesarEventos(p.batalla)
    sincronizarNaves(p.batalla, dtJuego)
    particulas.actualizar(dtJuego)
    escudos.actualizar(dtJuego)
    ondas.actualizar(dtJuego)
    p.terreno3d.actualizar(dtJuego)
    for (const pr of p.batalla.proyectiles)
      if (pr.tipo === 'torpedo') particulas.emitir(pr.pos, _n.set(0, 0, 0), COLOR_ESTELA_TORPEDO, 3, 0.9, 1.5)
    proyectiles.dibujar(p.batalla.proyectiles)
    motores.dibujar(p.batalla.naves)
    ajustarCalidad(p, dt)
    if (p.batalla.terminada) {
      p.fin += dt
      if (p.fin > 4.5) {
        const informe = armarInforme({
          resultado: p.batalla.terminada,
          batalla: p.batalla,
          segundos: p.batalla.tiempo,
          dificultad: p.config.dificultad,
        })
        const tipoMapa = p.batalla.terreno.tipo
        const config = p.config
        const esTutorial = p.esTutorial
        const enRed = !!p.red
        terminarBatalla()
        menus.mostrarFin(informe, MAPAS[tipoMapa].nombre, { ...config, enRed })
        document.getElementById('fin-ranking').innerHTML = esTutorial
          ? '<span>Las batallas del tutorial no entran al Salón de la Fama.</span>'
          : enRed
            ? '<span>Batalla multijugador: el ranking entre comandantes llega más adelante.</span>'
            : ''
        if (enRed) multijugador.terminar()
        else if (!esTutorial) salon.alTerminarBatalla({ informe, config, mapa: tipoMapa, faccion: config.faccion })
      }
    }
  } else if (!p) {
    // Portada y menús: una batalla de verdad de fondo, con cámara de cine.
    if (modelosListos && !escaparate) iniciarEscaparate()
    // De vuelta en los menús (después de una batalla) vuelve la música.
    if (sonido.ctx && !musica.activa) {
      musica.iniciar()
      sonido.escala = 0.3
    }
    if (escaparate) actualizarEscaparate(dt)
    else orbital.yaw += dt * 0.03
  }
  orbital.actualizar(dt)
  fondo.position.copy(camara.position)
  renderer.render(escena, camara)
  if (partida) {
    // En pausa táctica la cámara se mueve libre: las mallas siguen donde estaban.
    partida.hud.dibujar(pausa ? 0 : dt)
  }
}
cuadro()

// Si la máquina no llega a ~35 cuadros por segundo, baja la resolución.
function ajustarCalidad(p, dt) {
  const f = p.fps
  if (f.ajustado) return
  f.t += dt
  f.n++
  if (f.t < 5) return
  if (f.n / f.t < 35 && renderer.getPixelRatio() > 1) {
    renderer.setPixelRatio(1)
    renderer.setSize(contenedor.clientWidth, contenedor.clientHeight)
    particulas.puntos.material.uniforms.escala.value = escalaPuntos()
    motores.puntos.material.uniforms.escala.value = escalaPuntos()
    p.hud.registrar('Calidad ajustada para mantener la fluidez')
  }
  f.ajustado = true
}

// Gancho para depurar desde la consola: __flotas.simular(30) adelanta la
// batalla 30 segundos sin esperar a que se dibuje.
window.__flotas = {
  get partida() {
    return partida
  },
  efectos: { particulas, sonido, ondas, procesarEventos, sincronizarNaves },
  motor: { renderer, escena, camara, orbital },
  // Imagen para compartir: el cuadro 3D actual con el título encima, guardada
  // como assets/img/<nombre>.jpg por el servidor local (herramientas/servidor.py).
  async capturar({ nombre = 'compartir', ancho = 1200, alto = 630 } = {}) {
    await document.fonts.load('800 80px Cinzel')
    await document.fonts.load('700 20px Rajdhani')
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const g = lienzo.getContext('2d')
    renderer.render(escena, camara)
    g.drawImage(renderer.domElement, 0, 0, ancho, alto)
    // Oscurece la izquierda para el texto y da un poco de viñeta.
    const lado = g.createLinearGradient(0, 0, ancho * 0.75, 0)
    lado.addColorStop(0, 'rgba(2,3,8,0.88)')
    lado.addColorStop(0.55, 'rgba(2,3,8,0.45)')
    lado.addColorStop(1, 'rgba(2,3,8,0)')
    g.fillStyle = lado
    g.fillRect(0, 0, ancho, alto)
    const x = 64
    g.textBaseline = 'alphabetic'
    g.fillStyle = '#ffb648'
    g.font = '700 22px Rajdhani'
    g.letterSpacing = '8px'
    g.fillText('UNIVERSO FNOVA', x, 222)
    const oro = g.createLinearGradient(0, 240, 0, 400)
    oro.addColorStop(0, '#fff3dc')
    oro.addColorStop(0.5, '#f2c27e')
    oro.addColorStop(1, '#c26a2e')
    g.fillStyle = oro
    g.font = '800 82px Cinzel'
    g.letterSpacing = '3px'
    g.shadowColor = 'rgba(255,120,40,0.45)'
    g.shadowBlur = 24
    g.fillText('ECOS DE LA', x, 310)
    g.fillText('QUEMA', x, 400)
    g.shadowBlur = 0
    g.fillStyle = '#a9d6ff'
    g.font = '700 26px Rajdhani'
    g.letterSpacing = '16px'
    g.fillText('FLOTAS', x + 4, 448)
    g.fillStyle = '#efe3cf'
    g.font = '600 24px Rajdhani'
    g.letterSpacing = '1px'
    g.fillText('Batallas espaciales en 3D, en tiempo real.', x, 500)
    g.fillStyle = '#c8b9a2'
    g.fillText('Jugá gratis desde el navegador.', x, 532)
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.86))
    await fetch(`/__captura/${nombre}`, { method: 'POST', body: blob })
    return blob.size
  },
  simular(segundos) {
    const p = partida
    if (!p) return
    for (let t = 0; t < segundos && !p.batalla.terminada; t += PASO) {
      p.batalla.paso(PASO)
      p.ia.actualizar(PASO)
      procesarEventos(p.batalla)
      sincronizarNaves(p.batalla, PASO)
      particulas.actualizar(PASO)
    }
  },
}

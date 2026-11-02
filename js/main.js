// Punto de entrada: arma el motor, maneja las pantallas y corre el ciclo
// de la batalla (simulación → efectos → dibujo → HUD).
import * as THREE from 'three'
import { crearEscena } from './motor/escena.js'
import { cargarModelos, plantilla, crearMallaNave } from './motor/modelos.js'
import { CamaraOrbital } from './motor/camara.js'
import { Particulas, Proyectiles, Motores, Escudos, Ondas, COLOR_ESCUDO, COLOR_FUEGO, COLOR_HUMO, COLOR_FLAK, COLOR_DESTELLO } from './motor/efectos.js'
import { Sonido } from './motor/sonido.js'
import { Batalla, JUGADOR, ENEMIGO } from './sim/batalla.js'
import { ComandanteIA } from './sim/ia.js'
import { Terreno, MAPAS } from './sim/terreno.js'
import { Terreno3D } from './motor/terreno3d.js'
import { Tutorial, tutorialVisto } from './ui/tutorial.js'
import { Entrada } from './entrada.js'
import { Hud } from './ui/hud.js'
import { Menus, mostrarPantalla } from './ui/menus.js'
import { FACCIONES, TIPOS, ORDEN_TIPOS, DIFICULTADES } from './datos.js'

const contenedor = document.getElementById('juego')
const calidadInicial = (() => {
  try {
    return localStorage.getItem('calidad') ?? 'alta'
  } catch {
    return 'alta'
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
  // Batalla chica y fácil, con el tutorial desde el primer paso.
  alTutorial: () =>
    iniciarBatalla(
      { ...menus.config, presupuesto: 2500, dificultad: 'facil', mapa: 'mixto', flota: { caza: 2, corbeta: 1, bombardero: 1, crucero: 1, acorazado: 0 } },
      { tutorial: true },
    ),
})

cargarModelos((f) => menus.progreso(f))
  .then(() => menus.cargaLista())
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
    terminarBatalla()
    mostrarPantalla('pantalla-titulo')
  }
  if (a === 'pausa' && partida) abrirAyuda(true)
  if (a === 'sensores' && partida) alternarSensores()
  if (a === 'pausa-tactica' && partida) alternarPausaTactica()
  if (a === 'velocidad' && partida) alternarVelocidad()
  if (a === 'sonido') {
    sonido.iniciar()
    e.target.closest('[data-accion]').classList.toggle('activo', sonido.alternar())
  }
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
  partida.entrada.comando({ cmd: b.dataset.cmd, formacion: b.dataset.formacion, tactica: b.dataset.tactica })
})

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
  sonido.iniciar()
  sonido.ambiente(true)
  document.getElementById('btn-sonido').classList.toggle('activo', sonido.activo)
  const faccionEnemiga = config.faccion === 'guardianes' ? 'inquisidores' : 'guardianes'
  const flotaRival = flotaEnemiga(config.dificultad, config.presupuesto)
  const tipoMapa = config.mapa in MAPAS ? config.mapa : Object.keys(MAPAS)[Math.floor(Math.random() * 4)]
  // El terreno se estira con el tamaño de las flotas.
  const batallonesMax = Math.max(...[config.flota, flotaRival].map((f) => Object.values(f).reduce((a, b) => a + b, 0)))
  const terreno = new Terreno(tipoMapa, THREE.MathUtils.clamp(batallonesMax / 14, 1, 1.8))
  const batalla = new Batalla({
    faccionJugador: config.faccion,
    faccionEnemiga,
    plantilla,
    crearMalla: crearMallaNave,
    terreno,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.calidad === 'baja' ? 1 : 1.5))
  renderer.setSize(contenedor.clientWidth, contenedor.clientHeight)
  particulas.puntos.material.uniforms.escala.value = escalaPuntos()
  motores.puntos.material.uniforms.escala.value = escalaPuntos()

  const propios = desplegar(batalla, JUGADOR, config.flota)
  desplegar(batalla, ENEMIGO, flotaRival)
  const terreno3d = new Terreno3D(escena, terreno)
  for (const n of batalla.naves) escena.add(n.malla)

  const ia = new ComandanteIA(batalla, config.dificultad)
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
    alPausaTactica: () => alternarPausaTactica(),
    alVelocidad: () => alternarVelocidad(),
    alOrden: (evento) => partida?.tutorial?.notificar(evento),
  })
  hud = new Hud({ batalla, entrada, faccion: config.faccion, orbital })
  partida = {
    batalla, ia, entrada, hud, config, terreno3d,
    fin: 0,
    pausaTactica: false,
    velocidad: 1,
    fps: { t: 0, n: 0, ajustado: config.calidad === 'baja' },
  }
  pausa = false
  if (opciones.tutorial || !tutorialVisto()) partida.tutorial = new Tutorial({ orbital, ia })

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
  hud.registrar(`Flota ${FACCIONES[faccionEnemiga].nombre} detectada. A tus puestos, comandante.`)
  hud.registrar(`Mapa: ${MAPAS[tipoMapa].nombre}`)
}

function terminarBatalla() {
  if (!partida) return
  for (const n of partida.batalla.naves) if (n.malla) escena.remove(n.malla)
  partida.entrada.destruir()
  partida.terreno3d.destruir()
  partida.tutorial?.destruir()
  sonido.ambiente(false)
  partida.hud.destruir()
  partida = null
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

// --- Efectos a partir de los eventos de la simulación ------------------------

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const colorDisparo = new THREE.Color()
const COLOR_ESTELA_TORPEDO = new THREE.Color(0.5, 0.3, 0.12)
const COLOR_POLVO = new THREE.Color(0.45, 0.38, 0.3)

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

function sincronizarNaves(batalla, dt) {
  for (const n of batalla.naves) {
    const m = n.malla
    if (!m) continue
    // Las naves enemigas fuera de tus sensores no se dibujan.
    m.visible = !n.viva || n.equipo === JUGADOR || batalla.esVisible(JUGADOR, n)
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
        const resultado = p.batalla.terminada
        const tiempo = p.batalla.tiempo
        const batalla = p.batalla
        terminarBatalla()
        menus.mostrarFin(resultado, batalla, tiempo)
      }
    }
  } else if (!p) {
    // Menús: la cámara gira lenta mostrando el fondo.
    orbital.yaw += dt * 0.03
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

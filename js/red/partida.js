// Batalla en red entre dos comandantes.
//
// El anfitrión corre la simulación de verdad (la misma Batalla de siempre) y
// unas 10 veces por segundo manda al invitado el estado de todas las naves y
// los eventos (disparos, impactos, rocas rotas). El invitado tiene una
// BatallaRemota que no simula nada: acomoda las naves según lo recibido,
// dibuja disparos de utilería y manda sus órdenes al anfitrión.
//
// El invitado ve el mapa girado 180° (x → −x, z → −z) y con los bandos
// invertidos, así su flota es la "propia" (equipo 0) y aparece abajo, igual
// que para el anfitrión. Todo lo que cruza la red va en coordenadas del
// anfitrión; las funciones girar*() hacen la conversión.
import * as THREE from 'three'
import { Batalla, JUGADOR, ENEMIGO } from '../sim/batalla.js'
import { Terreno } from '../sim/terreno.js'
import { FACCIONES, PROYECTIL } from '../datos.js'

const ENVIOS_POR_SEGUNDO = 10
const GIRO = new THREE.Quaternion(0, 1, 0, 0) // 180° sobre el eje Y
const ORDENES = ['quieto', 'mover', 'atacar']

const girar = (v) => v.set(-v.x, v.y, -v.z)
const girarArr = ([x, y, z]) => [-x, y, -z]
const otroEquipo = (e) => (e === JUGADOR ? ENEMIGO : JUGADOR)
const r1 = (x) => Math.round(x * 10) / 10

// Descripción de la batalla para que el invitado la reconstruya igual.
export function describirBatalla(batalla, config) {
  return {
    facciones: batalla.facciones,
    terreno: { tipo: batalla.terreno.tipo, ancho: batalla.terreno.ancho, semilla: batalla.terreno.semilla },
    batallones: batalla.batallones.map((b) => ({
      equipo: b.equipo,
      tipo: b.tipo.clave,
      centro: b.destino.toArray().map(r1),
      rumbo: b.rumbo.toArray(),
    })),
    presupuesto: config.presupuesto,
  }
}

// --- Anfitrión -------------------------------------------------------------------

export class SincroAnfitrion {
  constructor(batalla, canal) {
    this.batalla = batalla
    this.canal = canal
    this.reloj = 0
    this.eventos = []
    this.finEnviado = false
    canal.al('orden', (o) => this.aplicarOrden(o))
  }

  // Lo que el invitado puede mandar: solo sobre sus propios batallones (equipo 1).
  aplicarOrden(o) {
    const b = this.batalla
    const propios = (o.b ?? []).map((i) => b.batallones[i]).filter((x) => x?.equipo === ENEMIGO && x.viva)
    if (!propios.length) return
    if (o.t === 'mover') b.ordenarMover(propios, new THREE.Vector3(...o.p), o.f ?? undefined)
    else if (o.t === 'atacar') {
      const objetivo = b.batallones[o.o]
      if (objetivo?.equipo === JUGADOR && objetivo.viva) b.ordenarAtacar(propios, objetivo)
    } else if (o.t === 'detener') b.ordenarDetener(propios)
    else if (o.t === 'formacion') b.cambiarFormacion(propios, o.f)
    else if (o.t === 'tactica') b.cambiarTactica(propios, o.v)
  }

  // Se llama después de cada paso de simulación, antes de que los efectos
  // consuman los eventos.
  recolectar() {
    const b = this.batalla
    const indice = (n) => b.naves.indexOf(n)
    for (const ev of b.eventos) {
      if (ev.tipo === 'disparo' && ev.autor) this.eventos.push(['d', indice(ev.autor), indice(ev.objetivo), ev.arma, ev.impacta ? 1 : 0])
      else if (ev.tipo === 'impacto') this.eventos.push(['i', indice(ev.nave), ev.pos.toArray().map(r1), ev.escudo ? 1 : 0, ev.arma])
      else if (ev.tipo === 'flak') this.eventos.push(['f', ev.pos.toArray().map(r1), ev.equipo])
      else if (ev.tipo === 'impactoRoca') this.eventos.push(['r', ev.pos.toArray().map(r1), ev.arma])
      else if (ev.tipo === 'rocaDestruida') this.eventos.push(['R', ev.asteroide.id])
      else if (ev.tipo === 'lanzamiento') this.eventos.push(['L', indice(ev.portanaves), b.batallones.indexOf(ev.batallon)])
    }
  }

  actualizar(dt) {
    const b = this.batalla
    this.reloj -= dt
    if (this.reloj <= 0) {
      this.reloj = 1 / ENVIOS_POR_SEGUNDO
      this.enviarEstado()
    }
    if (b.terminada && !this.finEnviado) {
      this.finEnviado = true
      this.enviarEstado()
      this.canal.enviar('fin', {
        resultado: b.terminada,
        tiempo: b.tiempo,
        estadisticas: b.estadisticas,
        batallones: b.batallones.map((x) => [Math.round(x.dañoCausado), x.bajas]),
      })
    }
  }

  enviarEstado() {
    const b = this.batalla
    const q = new THREE.Quaternion()
    const naves = b.naves.map((n) => {
      if (!n.viva) return 0
      q.copy(n.quat)
      return [
        r1(n.pos.x), r1(n.pos.y), r1(n.pos.z),
        Math.round(q.x * 1000), Math.round(q.y * 1000), Math.round(q.z * 1000), Math.round(q.w * 1000),
        Math.round(n.escudo), Math.round(n.estructura), Math.round(n.velocidad), Math.round(n.alabeo * 100),
      ]
    })
    const ordenes = b.batallones.map((x) => [ORDENES.indexOf(x.orden.tipo), x.orden.objetivo ? b.batallones.indexOf(x.orden.objetivo) : -1])
    this.canal.enviar('estado', { t: r1(b.tiempo), n: naves, o: ordenes, e: this.eventos })
    this.eventos = []
  }
}

// --- Invitado --------------------------------------------------------------------

export class BatallaRemota extends Batalla {
  constructor({ descripcion, plantilla, crearMalla, canal }) {
    const [fa, fi] = descripcion.facciones
    const t = descripcion.terreno
    const terreno = new Terreno(t.tipo, t.ancho, t.semilla)
    for (const a of terreno.asteroides) girar(a.pos)
    for (const n of terreno.nebulosas) girar(n.pos)
    // El invitado es el equipo 0 de su lado: bandos y facciones invertidos.
    super({ faccionJugador: fi, faccionEnemiga: fa, plantilla, crearMalla, terreno })
    this.canal = canal
    this.objetivos = new Map() // nave → { pos, quat } recibidos
    for (const d of descripcion.batallones)
      this.agregarBatallon(otroEquipo(d.equipo), d.tipo, new THREE.Vector3(...girarArr(d.centro)), new THREE.Vector3(...girarArr(d.rumbo)))
    canal.al('estado', (e) => this.aplicarEstado(e))
    canal.al('fin', (f) => this.aplicarFin(f))
  }

  // --- Órdenes: se muestran acá y se mandan al anfitrión ---------------------

  indices(batallones) {
    return batallones.map((b) => this.batallones.indexOf(b))
  }

  ordenarMover(batallones, punto, formacion) {
    super.ordenarMover(batallones, punto, formacion)
    this.canal.enviar('orden', { t: 'mover', b: this.indices(batallones), p: girarArr(punto.toArray()), f: formacion ?? null })
  }

  ordenarAtacar(batallones, objetivo) {
    super.ordenarAtacar(batallones, objetivo)
    this.canal.enviar('orden', { t: 'atacar', b: this.indices(batallones), o: this.batallones.indexOf(objetivo) })
  }

  ordenarDetener(batallones) {
    super.ordenarDetener(batallones)
    this.canal.enviar('orden', { t: 'detener', b: this.indices(batallones) })
  }

  cambiarFormacion(batallones, formacion) {
    for (const b of batallones) b.formacion = formacion
    this.canal.enviar('orden', { t: 'formacion', b: this.indices(batallones), f: formacion })
  }

  cambiarTactica(batallones, tactica) {
    super.cambiarTactica(batallones, tactica)
    this.canal.enviar('orden', { t: 'tactica', b: this.indices(batallones), v: tactica })
  }

  // --- Estado recibido ---------------------------------------------------------

  aplicarEstado({ t, n, o, e }) {
    this.tiempoRemoto = t
    n.forEach((d, i) => {
      const nave = this.naves[i]
      if (!nave) return
      if (d === 0) {
        if (nave.viva) this.destruirRemota(nave)
        return
      }
      let obj = this.objetivos.get(nave)
      if (!obj) this.objetivos.set(nave, (obj = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), primera: true }))
      obj.pos.set(-d[0], d[1], -d[2])
      obj.quat.set(d[3] / 1000, d[4] / 1000, d[5] / 1000, d[6] / 1000).normalize().premultiply(GIRO)
      nave.escudo = d[7]
      nave.estructura = d[8]
      nave.velocidad = d[9]
      nave.alabeo = d[10] / 100
      if (obj.primera) {
        nave.pos.copy(obj.pos)
        nave.quat.copy(obj.quat)
        obj.primera = false
      }
    })
    // Órdenes: el invitado ve en su HUD lo que hacen sus batallones de verdad.
    o.forEach(([tipo, objetivo], i) => {
      const b = this.batallones[i]
      if (!b || b.equipo !== JUGADOR) return
      if (tipo === 2 && this.batallones[objetivo]) b.orden = { tipo: 'atacar', objetivo: this.batallones[objetivo] }
      else if (tipo === 0 && b.orden.tipo === 'atacar') b.orden = { tipo: 'quieto' }
    })
    for (const ev of e) this.aplicarEvento(ev)
  }

  aplicarEvento(ev) {
    const pos = (a) => new THREE.Vector3(-a[0], a[1], -a[2])
    if (ev[0] === 'd') {
      const autor = this.naves[ev[1]]
      const objetivo = this.naves[ev[2]]
      if (!autor || !objetivo) return
      autor.ultimoDisparo = this.tiempo
      this.disparoDeUtileria(autor, objetivo, ev[3], ev[4] === 1)
    } else if (ev[0] === 'i') {
      const nave = this.naves[ev[1]]
      if (!nave?.viva) return
      nave.ultimoImpacto = this.tiempo
      this.eventos.push({ tipo: 'impacto', nave, pos: pos(ev[2]), escudo: ev[3] === 1, arma: ev[4] })
    } else if (ev[0] === 'f') this.eventos.push({ tipo: 'flak', pos: pos(ev[1]), equipo: otroEquipo(ev[2]) })
    else if (ev[0] === 'r') this.eventos.push({ tipo: 'impactoRoca', pos: pos(ev[1]), arma: ev[2] })
    else if (ev[0] === 'L') {
      // Un portanaves lanzó un caza: se crea igual acá (mismo orden de naves y batallones).
      const portanaves = this.naves[ev[1]]
      if (portanaves) this.lanzarCaza(portanaves, this.batallones[ev[2]])
    } else if (ev[0] === 'R') {
      const a = this.terreno.asteroides.find((x) => x.id === ev[1])
      if (a && this.terreno.dañar(a, Infinity)) this.eventos.push({ tipo: 'rocaDestruida', asteroide: a })
    }
  }

  // Proyectil solo visual: el daño ya lo calculó el anfitrión.
  disparoDeUtileria(autor, objetivo, arma, impacta) {
    const p = PROYECTIL[arma] ?? PROYECTIL.laser
    const origen = autor.pos.clone().addScaledVector(autor.adelante, autor.radio * 0.6)
    const destino = objetivo.pos.clone()
    if (!impacta) destino.add(new THREE.Vector3().randomDirection().multiplyScalar(objetivo.radio * 2 + 8))
    const dir = destino.clone().sub(origen)
    const largo = dir.length()
    dir.divideScalar(largo || 1)
    const faccion = FACCIONES[autor.batallon.faccion]
    this.proyectiles.push({
      pos: origen,
      dir,
      velocidad: p.velocidad,
      largo: p.largo,
      grosor: p.grosor,
      color: new THREE.Color(arma === 'torpedo' ? 0xffd080 : faccion.disparo).multiplyScalar(arma === 'cañon' ? 2.2 : 1.6),
      vida: largo / p.velocidad + (impacta ? 0 : 0.6),
      tipo: arma,
    })
    this.eventos.push({ tipo: 'disparo', pos: origen, arma, equipo: autor.equipo })
  }

  destruirRemota(nave) {
    nave.viva = false
    nave.estructura = 0
    nave.escudo = 0
    nave.deriva = nave.adelante.clone().multiplyScalar(nave.velocidad * 0.4).add(new THREE.Vector3().randomDirection().multiplyScalar(nave.esCapital ? 3 : 10))
    nave.ejeGiro = new THREE.Vector3().randomDirection()
    nave.giroMuerte = (nave.esCapital ? 0.12 : 2.5) * (0.5 + Math.random())
    this.estadisticas[nave.equipo].perdidas++
    this.estadisticas[otroEquipo(nave.equipo)].destruidas++
    this.eventos.push({ tipo: 'destruida', nave })
    if (!nave.batallon.viva) this.eventos.push({ tipo: 'batallonPerdido', batallon: nave.batallon })
  }

  aplicarFin({ resultado, tiempo, estadisticas, batallones }) {
    // El resultado llega desde el lado del anfitrión: se invierte.
    this.terminada = resultado === 'victoria' ? 'derrota' : 'victoria'
    this.tiempo = tiempo
    this.estadisticas = [estadisticas[1], estadisticas[0]]
    batallones.forEach(([daño, bajas], i) => {
      const b = this.batallones[i]
      if (b) Object.assign(b, { dañoCausado: daño, bajas })
    })
  }

  // --- Paso: solo interpolar y animar, nada de simulación ---------------------

  paso(dt) {
    if (!this.terminada) this.tiempo += dt
    const k = 1 - Math.exp(-dt * 10)
    for (const n of this.naves) {
      if (n.viva) {
        const obj = this.objetivos.get(n)
        if (obj) {
          // Avanza con su velocidad y corrige hacia la última posición recibida.
          n.pos.addScaledVector(n.adelante, n.velocidad * dt * 0.5).lerp(obj.pos, k)
          n.quat.slerp(obj.quat, k)
        }
      } else if (n.malla !== undefined && n.muerte < 4) {
        n.muerte += dt
        n.pos.addScaledVector(n.deriva, dt)
        n.quat.multiply(new THREE.Quaternion().setFromAxisAngle(n.ejeGiro, n.giroMuerte * dt))
      }
    }
    for (let i = this.proyectiles.length - 1; i >= 0; i--) {
      const p = this.proyectiles[i]
      p.pos.addScaledVector(p.dir, p.velocidad * dt)
      p.vida -= dt
      if (p.vida <= 0) this.proyectiles.splice(i, 1)
    }
    this.relojSensores -= dt
    if (this.relojSensores <= 0) {
      this.relojSensores = 0.4
      this.actualizarSensores()
    }
  }
}

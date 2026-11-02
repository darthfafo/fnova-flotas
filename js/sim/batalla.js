// Simulación de la batalla: naves, batallones, movimiento, formaciones y
// combate. No dibuja nada: expone el estado y emite eventos (disparo,
// impacto, destrucción) que el motor convierte en efectos.
import * as THREE from 'three'
import { TIPOS, PUNTERIA, PROYECTIL, TACTICAS, CAPITAL, multiplicadorDaño, FACCIONES } from '../datos.js'
import { Terreno } from './terreno.js'

const Z = new THREE.Vector3(0, 0, 1)
const ARRIBA = new THREE.Vector3(0, 1, 0)
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _u = new THREE.Vector3()
const _dirQ = new THREE.Vector3()
const ORIGEN = new THREE.Vector3()

export const JUGADOR = 0
export const ENEMIGO = 1

let siguienteId = 1

export class Nave {
  constructor(batallon, tipo, plantilla, pos, quat) {
    this.id = siguienteId++
    this.batallon = batallon
    this.equipo = batallon.equipo
    this.tipo = TIPOS[tipo]
    this.esCapital = this.tipo.clase === CAPITAL
    this.pos = pos.clone()
    this.quat = quat.clone()
    this.velocidad = 0
    this.estructura = this.tipo.estructuraMax
    this.escudo = this.tipo.escudoMax
    this.ultimoImpacto = -99
    this.viva = true
    this.radio = plantilla.radio
    this.cola = plantilla.cola
    this.colorMotor = new THREE.Color(FACCIONES[batallon.faccion].acento).lerp(new THREE.Color(1, 1, 1), 0.25)
    this.armas = this.tipo.armas.map((a) => ({ ...a, enfriamiento: Math.random() * a.cadencia, objetivo: null }))
    this.slot = new THREE.Vector3()
    this.alabeo = 0
    // Pasadas de ataque de los cazas: 'acercarse' | 'romper'
    this.fase = 'acercarse'
    this.puntoRuptura = new THREE.Vector3()
    this.tiempoFase = 0
    this.objetivo = null
    this.muerte = 0 // segundos desde que la destruyeron (animación de naves capitales)
    this.ultimoDisparo = -99
    this.enNebulosa = null
    this._adelante = new THREE.Vector3()
  }

  get adelante() {
    return this._adelante.copy(Z).applyQuaternion(this.quat)
  }
}

export class Batallon {
  constructor(id, equipo, faccion, tipo, numero) {
    this.id = id
    this.equipo = equipo
    this.faccion = faccion
    this.tipo = TIPOS[tipo]
    this.nombre = `${this.tipo.nombre} ${numero}`
    this.naves = []
    this.orden = { tipo: 'quieto' }
    this.destino = new THREE.Vector3()
    this.rumbo = new THREE.Vector3(0, 0, 1)
    this.formacion = 'delta'
    this.tactica = 'agresiva'
    this.topeVelocidad = Infinity
    this.atacadoEn = -99
    // Para el informe de fin de batalla.
    this.dañoCausado = 0
    this.bajas = 0
  }

  get vivas() {
    return this.naves.filter((n) => n.viva)
  }

  get viva() {
    return this.naves.some((n) => n.viva)
  }

  centro(destino = new THREE.Vector3()) {
    destino.set(0, 0, 0)
    let k = 0
    for (const n of this.naves)
      if (n.viva) {
        destino.add(n.pos)
        k++
      }
    return k ? destino.divideScalar(k) : destino
  }

  salud() {
    let e = 0, eMax = 0, s = 0, sMax = 0
    for (const n of this.naves) {
      eMax += n.tipo.estructuraMax
      sMax += n.tipo.escudoMax
      if (n.viva) {
        e += n.estructura
        s += n.escudo
      }
    }
    return { estructura: e / eMax, escudo: s / sMax }
  }
}

// Posiciones relativas (adelante = +Z) para n elementos en una formación.
export function slotsFormacion(formacion, n, esp) {
  const r = []
  if (n === 1) return [new THREE.Vector3()]
  if (formacion === 'delta') {
    r.push(new THREE.Vector3(0, 0, 0))
    for (let i = 1; i < n; i++) {
      const fila = Math.ceil(i / 2)
      const lado = i % 2 ? -1 : 1
      r.push(new THREE.Vector3(lado * fila * esp, (fila % 2) * esp * 0.15, -fila * esp * 0.9))
    }
  } else if (formacion === 'muro') {
    const cols = Math.ceil(Math.sqrt(n * 2))
    const filas = Math.ceil(n / cols)
    for (let i = 0; i < n; i++) {
      const c = i % cols
      const f = Math.floor(i / cols)
      r.push(new THREE.Vector3((c - (cols - 1) / 2) * esp, ((filas - 1) / 2 - f) * esp * 0.8, 0))
    }
  } else if (formacion === 'esfera') {
    const R = Math.max(esp, (esp * Math.sqrt(n)) / 1.6)
    for (let i = 0; i < n; i++) {
      // Espiral de Fibonacci: puntos parejos sobre la esfera.
      const y = 1 - (2 * (i + 0.5)) / n
      const rr = Math.sqrt(1 - y * y)
      const th = i * 2.399963
      r.push(new THREE.Vector3(Math.cos(th) * rr * R, y * R * 0.7, Math.sin(th) * rr * R))
    }
  } else if (formacion === 'garra') {
    const arco = Math.PI * 0.9
    const R = Math.max(esp * 1.2, (esp * n) / arco)
    for (let i = 0; i < n; i++) {
      const a = -arco / 2 + (arco * (i + 0.5)) / n
      r.push(new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R - R))
    }
  }
  return r
}

export function quatHacia(dir, destino = new THREE.Quaternion()) {
  _m.lookAt(_dirQ.copy(dir), ORIGEN, Math.abs(dir.y) > 0.98 ? Z : ARRIBA)
  return destino.setFromRotationMatrix(_m)
}

export class Batalla {
  constructor({ faccionJugador, faccionEnemiga, plantilla, crearMalla, terreno }) {
    this.tiempo = 0
    this.terreno = terreno ?? new Terreno('abierto')
    // Naves enemigas que cada bando tiene en sus sensores (ver actualizarSensores).
    this.visibles = [new Set(), new Set()]
    this.relojSensores = 0
    this.naves = []
    this.batallones = []
    this.proyectiles = []
    this.eventos = [] // { tipo, ... } consumidos por el motor cada cuadro
    this.facciones = [faccionJugador, faccionEnemiga]
    this.plantilla = plantilla
    this.crearMalla = crearMalla
    this.contador = [{}, {}]
    this.estadisticas = [
      { perdidas: 0, destruidas: 0, daño: 0 },
      { perdidas: 0, destruidas: 0, daño: 0 },
    ]
    this.terminada = null
  }

  agregarBatallon(equipo, tipo, centro, rumbo) {
    const faccion = this.facciones[equipo]
    this.contador[equipo][tipo] = (this.contador[equipo][tipo] ?? 0) + 1
    const b = new Batallon(this.batallones.length + 1, equipo, faccion, tipo, this.contador[equipo][tipo])
    b.rumbo.copy(rumbo)
    b.destino.copy(centro)
    const p = this.plantilla(faccion, tipo)
    const q = quatHacia(rumbo)
    const slots = slotsFormacion(b.formacion, b.tipo.porBatallon, p.radio * 3.2)
    for (const s of slots) {
      const pos = s.clone().applyQuaternion(q).add(centro)
      const n = new Nave(b, tipo, p, pos, q)
      n.slot.copy(s)
      n.malla = this.crearMalla(faccion, tipo)
      b.naves.push(n)
      this.naves.push(n)
    }
    this.batallones.push(b)
    return b
  }

  enemigosDe(equipo, soloVisibles = false) {
    return this.batallones.filter((b) => b.equipo !== equipo && b.viva && (!soloVisibles || this.batallonVisible(equipo, b)))
  }

  // --- Sensores -------------------------------------------------------------
  // En espacio abierto se ve todo a 3500 m. Dentro de una nebulosa una nave
  // solo se detecta de muy cerca, y quien mira desde adentro ve poco. Disparar
  // delata la posición durante unos segundos.

  esVisible(equipo, nave) {
    return nave.equipo === equipo || this.visibles[equipo].has(nave)
  }

  batallonVisible(equipo, b) {
    return b.equipo === equipo || b.naves.some((n) => n.viva && this.visibles[equipo].has(n))
  }

  actualizarSensores() {
    for (const n of this.naves) if (n.viva) n.enNebulosa = this.terreno.nebulosaEn(n.pos)
    for (const equipo of [0, 1]) {
      const vis = this.visibles[equipo]
      vis.clear()
      const propias = this.naves.filter((n) => n.viva && n.equipo === equipo)
      for (const e of this.naves) {
        if (!e.viva || e.equipo === equipo) continue
        let rango = e.enNebulosa ? 280 : 3500
        if (this.tiempo - e.ultimoDisparo < 2.5) rango = Math.max(rango, 1600)
        for (const o of propias) {
          const r = o.enNebulosa ? Math.min(rango, 900) : rango
          if (o.pos.distanceToSquared(e.pos) < r * r) {
            vis.add(e)
            break
          }
        }
      }
    }
  }

  // --- Órdenes -----------------------------------------------------------

  ordenarMover(batallones, punto, formacion) {
    if (!batallones.length) return
    const centro = new THREE.Vector3()
    for (const b of batallones) centro.add(b.centro(_v))
    centro.divideScalar(batallones.length)
    const rumbo = punto.clone().sub(centro)
    rumbo.y *= 0.3
    if (rumbo.lengthSq() < 1) rumbo.copy(batallones[0].rumbo)
    rumbo.normalize()
    const q = quatHacia(rumbo)
    const esp = Math.max(...batallones.map((b) => radioBatallon(b, this))) * 2.4
    const slots = slotsFormacion(formacion ?? batallones[0].formacion, batallones.length, esp)
    // El más lento marca el ritmo (como un grupo de ataque de Homeworld).
    const tope = batallones.length > 1 ? Math.min(...batallones.map((b) => b.tipo.velocidad)) : Infinity
    // Los más pesados al centro de la formación.
    const ordenados = [...batallones].sort((a, b) => b.tipo.largo - a.tipo.largo)
    ordenados.forEach((b, i) => {
      b.orden = { tipo: 'mover' }
      b.destino.copy(slots[i]).applyQuaternion(q).add(punto)
      b.rumbo.copy(rumbo)
      b.topeVelocidad = tope
      if (formacion) b.formacion = formacion
      for (const n of b.naves) n.objetivo = null
    })
  }

  ordenarAtacar(batallones, objetivo) {
    for (const b of batallones) {
      if (b.equipo === objetivo.equipo) continue
      b.orden = { tipo: 'atacar', objetivo }
      b.topeVelocidad = Infinity
      for (const n of b.naves) n.objetivo = null
    }
  }

  ordenarDetener(batallones) {
    for (const b of batallones) {
      b.orden = { tipo: 'quieto' }
      b.destino.copy(b.centro(_v))
      b.topeVelocidad = Infinity
      for (const n of b.naves) n.objetivo = null
    }
  }

  cambiarFormacion(batallones, formacion) {
    for (const b of batallones) b.formacion = formacion
    if (batallones.every((b) => b.orden.tipo !== 'atacar')) {
      const centro = new THREE.Vector3()
      for (const b of batallones) centro.add(b.destino)
      centro.divideScalar(batallones.length)
      // Reacomoda el grupo en el lugar, sin moverlo.
      const quietos = batallones.filter((b) => b.orden.tipo !== 'atacar')
      if (quietos.length > 1) this.ordenarMover(quietos, centro, formacion)
    }
  }

  // --- Paso de simulación -------------------------------------------------

  paso(dt) {
    // Con la batalla resuelta solo siguen las animaciones de destrucción
    // (para que la última capital alcance a estallar).
    const enCurso = !this.terminada
    if (enCurso) {
      this.tiempo += dt
      this.relojSensores -= dt
      if (this.relojSensores <= 0) {
        this.relojSensores = 0.4
        this.actualizarSensores()
      }
      for (const b of this.batallones) if (b.viva) this.pensarBatallon(b)
    }
    for (const n of this.naves) {
      if (n.viva) {
        if (!enCurso) continue
        this.moverNave(n, dt)
        this.dispararNave(n, dt)
        this.regenerar(n, dt)
      } else if (n.malla !== undefined && n.muerte < 4) {
        // La explosión final de una capital destroza las rocas de alrededor.
        if (n.esCapital && n.muerte < 3 && n.muerte + dt >= 3) this.dañarRocasCerca(n.pos, n.radio * 4, 600)
        n.muerte += dt
        n.pos.addScaledVector(n.deriva, dt)
        n.quat.multiply(_q.setFromAxisAngle(n.ejeGiro, n.giroMuerte * dt))
      }
    }
    if (!enCurso) return
    this.separar(dt)
    this.moverProyectiles(dt)
    this.comprobarFin()
  }

  pensarBatallon(b) {
    // Objetivo destruido: vuelve a quedarse quieto donde está.
    if (b.orden.tipo === 'atacar' && !b.orden.objetivo.viva) {
      b.orden = { tipo: 'quieto' }
      b.destino.copy(b.centro(_v))
    }
    // Blanco perdido de los sensores por un rato: se da por perdido.
    if (b.orden.tipo === 'atacar') {
      if (this.batallonVisible(b.equipo, b.orden.objetivo)) b.orden.vistoEn = this.tiempo
      else if (this.tiempo - (b.orden.vistoEn ?? this.tiempo) > 4) {
        b.orden = { tipo: 'quieto' }
        b.destino.copy(b.centro(_v))
      } else b.orden.vistoEn ??= this.tiempo
    }
    // Adquisición automática según la táctica.
    if (b.orden.tipo === 'quieto') {
      const alcance = TACTICAS[b.tactica].alcanceDeteccion
      const atacado = this.tiempo - b.atacadoEn < 3
      if (alcance > 0 || atacado) {
        const c = b.centro(_v).clone()
        let mejor = null
        let dMejor = atacado ? Math.max(alcance, 900) : alcance
        for (const e of this.enemigosDe(b.equipo, true)) {
          const d = e.centro(_w).distanceTo(c)
          if (d < dMejor) {
            dMejor = d
            mejor = e
          }
        }
        if (mejor) b.orden = { tipo: 'atacar', objetivo: mejor, automatico: true }
      }
    }
  }

  elegirObjetivoNave(n, b) {
    const ob = b.orden.objetivo
    if (!ob?.viva) return null
    if (n.objetivo?.viva && n.objetivo.batallon === ob && this.esVisible(n.equipo, n.objetivo)) return n.objetivo
    // El más cercano, con algo de azar para que no ataquen todos al mismo.
    let mejor = null
    let puntaje = Infinity
    for (const o of ob.naves) {
      if (!o.viva || !this.esVisible(n.equipo, o)) continue
      const s = o.pos.distanceTo(n.pos) * (0.7 + Math.random() * 0.6)
      if (s < puntaje) {
        puntaje = s
        mejor = o
      }
    }
    n.objetivo = mejor
    return mejor
  }

  moverNave(n, dt) {
    const b = n.batallon
    const t = n.tipo
    let destino = _v
    let velDeseada = Math.min(t.velocidad, b.topeVelocidad)
    let llegar = true

    if (b.orden.tipo === 'atacar') {
      const obj = this.elegirObjetivoNave(n, b)
      if (obj) {
        const dist = obj.pos.distanceTo(n.pos)
        // Las capitales se ubican según su arma de menor alcance, para que
        // disparen todas sus torretas.
        const alcance = n.esCapital ? Math.min(...t.armas.map((a) => a.alcance)) : t.armas[0].alcance
        if (n.esCapital) {
          // Las capitales se acercan hasta tener a tiro y después maniobran
          // de costado al blanco, para que disparen todas las torretas de
          // una banda (la andanada), corrigiendo la distancia de a poco.
          const ideal = alcance * 0.7
          if (dist > alcance * 0.95) destino.copy(obj.pos)
          else {
            const radial = _w.copy(obj.pos).sub(n.pos).divideScalar(dist)
            const lado = n.ladoAndanada ?? (n.ladoAndanada = Math.random() < 0.5 ? 1 : -1)
            const tangente = _u.crossVectors(radial, ARRIBA).normalize().multiplyScalar(lado)
            destino
              .copy(n.pos)
              .addScaledVector(tangente, 100)
              .addScaledVector(radial, THREE.MathUtils.clamp(dist - ideal, -80, 80))
            velDeseada = Math.min(velDeseada, t.velocidad * 0.45)
          }
          llegar = false
        } else {
          n.tiempoFase -= dt
          const distRuptura = obj.esCapital ? obj.radio + 25 : 35
          if (n.fase === 'acercarse') {
            // Apunta adelantándose al movimiento del blanco.
            const tVuelo = dist / PROYECTIL[t.armas[0].tipo].velocidad
            destino.copy(obj.pos).addScaledVector(obj.adelante, obj.velocidad * tVuelo)
            if (dist < distRuptura) {
              n.fase = 'romper'
              n.tiempoFase = (obj.esCapital ? 1.4 : 1.1) + Math.random() * 0.8
              // Sigue de largo y abre hacia un costado al azar (perpendicular
              // al avance), como una pasada de ametrallamiento.
              const adelante = n.adelante
              const lateral = _w.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.8, Math.random() - 0.5)
              lateral.addScaledVector(adelante, -lateral.dot(adelante)).normalize()
              const largo = obj.esCapital ? 140 + obj.radio * 1.5 : 180
              n.puntoRuptura.copy(n.pos).addScaledVector(adelante, largo).addScaledVector(lateral, largo * 0.6)
            }
          } else {
            destino.copy(n.puntoRuptura)
            if (n.tiempoFase <= 0) n.fase = 'acercarse'
          }
          llegar = false
        }
      }
    } else {
      // Mover / quieto: ir al lugar en la formación del batallón.
      const q = quatHacia(b.rumbo, _q)
      const clave = b.formacion + b.naves.length
      if (b.slotsClave !== clave) {
        b.slotsClave = clave
        b.slots = slotsFormacion(b.formacion, b.naves.length, n.radio * 3.2)
      }
      destino.copy(b.slots[b.naves.indexOf(n)]).applyQuaternion(q).add(b.destino)
    }

    if (!n.esCapital && b.tactica === 'evasiva' && this.tiempo - b.atacadoEn < 2) {
      const f = this.tiempo * 2.3 + n.id
      destino.x += Math.sin(f) * 40
      destino.y += Math.cos(f * 1.3) * 30
    }
    const aDestino = _w.copy(destino).sub(n.pos)
    const dist = aDestino.length()
    if (llegar) {
      if (dist < 2) {
        // Llegó: se alinea con el rumbo del batallón y se detiene.
        velDeseada = 0
        n.quat.rotateTowards(quatHacia(b.rumbo, _q), t.giro * dt * 0.5)
        if (b.orden.tipo === 'mover' && b.naves.every((x) => !x.viva || x.velocidad < 1)) {
          b.orden = { tipo: 'quieto' }
          b.topeVelocidad = Infinity
        }
      } else velDeseada = Math.min(velDeseada, dist * (n.esCapital ? 0.35 : 0.9) + 1)
    }
    const anterior = n.adelante.clone()
    if (dist > 0.5 && velDeseada > 0) {
      aDestino.divideScalar(dist)
      if (this.terreno.asteroides.length)
        this.terreno.desviar(n.pos, aDestino, n.radio, Math.min(dist, n.esCapital ? 260 : 160))
      n.quat.rotateTowards(quatHacia(aDestino, _q), t.giro * dt)
    }
    const adelante = n.adelante
    const alineado = dist > 0.5 ? Math.max(0, adelante.dot(aDestino)) : 1
    const objetivoVel = velDeseada * (n.esCapital ? alineado * alineado : Math.max(0.4, alineado))
    const dv = THREE.MathUtils.clamp(objetivoVel - n.velocidad, -t.aceleracion * 1.5 * dt, t.aceleracion * dt)
    n.velocidad = Math.max(0, n.velocidad + dv)
    n.pos.addScaledVector(adelante, n.velocidad * dt)
    if (this.terreno.asteroides.length) this.terreno.expulsar(n.pos, n.radio)

    // Alabeo visual de los cazas en los giros.
    if (!n.esCapital) {
      const giroLateral = anterior.cross(adelante).y / Math.max(dt, 1e-3)
      n.alabeo = THREE.MathUtils.lerp(n.alabeo, THREE.MathUtils.clamp(-giroLateral * 0.6, -1.1, 1.1), 0.1)
    }
  }

  separar(dt) {
    const naves = this.naves
    for (let i = 0; i < naves.length; i++) {
      const a = naves[i]
      if (!a.viva) continue
      for (let j = i + 1; j < naves.length; j++) {
        const b = naves[j]
        if (!b.viva) continue
        const min = (a.radio + b.radio) * 0.9
        const dx = a.pos.x - b.pos.x
        const dy = a.pos.y - b.pos.y
        const dz = a.pos.z - b.pos.z
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 >= min * min || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const empuje = ((min - d) / d) * Math.min(1, dt * 4)
        // La nave más chica es la que se corre.
        const pa = b.radio / (a.radio + b.radio)
        a.pos.x += dx * empuje * pa
        a.pos.y += dy * empuje * pa
        a.pos.z += dz * empuje * pa
        b.pos.x -= dx * empuje * (1 - pa)
        b.pos.y -= dy * empuje * (1 - pa)
        b.pos.z -= dz * empuje * (1 - pa)
      }
    }
  }

  dispararNave(n, dt) {
    const b = n.batallon
    for (const arma of n.armas) {
      arma.enfriamiento -= dt
      if (arma.enfriamiento > 0) continue
      let obj = null
      if (n.esCapital) {
        // Torretas: el blanco ordenado si está a tiro; si no, lo más cercano.
        const ordenado = n.objetivo?.viva && this.esVisible(n.equipo, n.objetivo) ? n.objetivo : null
        if (ordenado && ordenado.pos.distanceTo(n.pos) <= arma.alcance && this.enArco(n, arma, ordenado)) obj = ordenado
        else if (b.tactica !== 'evasiva' || this.tiempo - b.atacadoEn < 3) obj = this.masCercano(n, arma, arma.tipo === 'cañon')
      } else {
        const o = b.orden.tipo === 'atacar' ? n.objetivo : null
        if (o?.viva && this.esVisible(n.equipo, o)) {
          _v.copy(o.pos).sub(n.pos)
          const d = _v.length()
          if (d <= arma.alcance && n.adelante.dot(_v.divideScalar(d)) > Math.cos(arma.cono)) obj = o
        }
      }
      if (!obj) {
        arma.enfriamiento = 0.15
        continue
      }
      arma.enfriamiento = arma.cadencia * (0.9 + Math.random() * 0.2)
      this.disparar(n, arma, obj)
    }
  }

  // Las torretas montadas a un costado solo cubren su banda; las del eje
  // central giran casi completas (salvo justo detrás).
  enArco(n, arma, o) {
    const lado = arma.montaje?.[0] ?? 0
    _u.copy(o.pos).sub(n.pos).normalize().applyQuaternion(_q.copy(n.quat).invert())
    if (lado === 0) return _u.z > -0.8
    return _u.x * Math.sign(lado) > -0.25
  }

  masCercano(n, arma, prefiereCapitales) {
    let mejor = null
    let dMejor = arma.alcance
    for (const o of this.naves) {
      if (!o.viva || o.equipo === n.equipo) continue
      if (!this.visibles[n.equipo].has(o) || !this.enArco(n, arma, o)) continue
      let d = o.pos.distanceTo(n.pos)
      if (prefiereCapitales && !o.esCapital) d *= 1.8
      if (d < dMejor) {
        dMejor = d
        mejor = o
      }
    }
    return mejor
  }

  disparar(n, arma, obj) {
    const p = PROYECTIL[arma.tipo]
    const origen = new THREE.Vector3()
    if (arma.montaje) {
      const tp = this.plantilla(n.batallon.faccion, n.tipo.clave)
      origen.set(arma.montaje[0] * tp.ancho, arma.montaje[1] * tp.alto, arma.montaje[2] * n.tipo.largo).applyQuaternion(n.quat).add(n.pos)
    } else origen.copy(n.pos).addScaledVector(n.adelante, n.radio * 0.6)
    let acierto = PUNTERIA[arma.tipo][obj.tipo.clase]
    // La agilidad esquiva disparos apuntados, no la metralla del flak.
    if (arma.tipo !== 'flak') acierto *= obj.tipo.agilidad ?? 1
    if (!obj.esCapital && obj.batallon.tactica === 'evasiva') acierto *= 0.75
    const impacta = Math.random() < acierto
    const daño = arma.daño * multiplicadorDaño(n.tipo.clave, obj.tipo.clave) * (0.85 + Math.random() * 0.3)
    const apunta = obj.pos.clone()
    // Flak contra naves chicas: no busca el impacto directo, estalla cerca
    // del blanco (más cerca si "acierta") y daña a todo lo que agarre.
    const proximidad = arma.tipo === 'flak' && !obj.esCapital
    const tVuelo = origen.distanceTo(obj.pos) / p.velocidad
    if (proximidad) {
      apunta.addScaledVector(obj.adelante, obj.velocidad * tVuelo)
      apunta.add(_v.randomDirection().multiplyScalar(impacta ? Math.random() * 6 : 10 + Math.random() * 18))
    } else if (!impacta)
      apunta.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(obj.radio * 2 + 8))
    n.ultimoDisparo = this.tiempo
    // Un asteroide en el medio se come el disparo.
    let contraRoca = null
    if (this.terreno.asteroides.length) {
      // Un disparo que acierta solo recorre hasta el blanco; uno que falla
      // sigue de largo y puede terminar en una roca.
      const fin =
        impacta || proximidad
          ? apunta
          : _w.copy(apunta).sub(origen).normalize().multiplyScalar(arma.alcance * 1.2).add(origen)
      const corte = this.terreno.bloquea(origen, fin)
      if (corte) {
        contraRoca = corte
        apunta.copy(origen).addScaledVector(_v.copy(apunta).sub(origen).normalize(), corte.distancia)
      }
    }
    const dir = apunta.clone().sub(origen).normalize()
    const faccion = FACCIONES[n.batallon.faccion]
    this.proyectiles.push({
      pos: origen,
      dir,
      velocidad: p.velocidad,
      largo: p.largo,
      grosor: p.grosor,
      color: new THREE.Color(arma.tipo === 'torpedo' ? 0xffd080 : faccion.disparo).multiplyScalar(arma.tipo === 'cañon' ? 2.2 : 1.6),
      objetivo: impacta && !proximidad && !contraRoca ? obj : null,
      daño,
      autor: n,
      vida: proximidad || contraRoca ? origen.distanceTo(apunta) / p.velocidad : arma.alcance / p.velocidad + 1.2,
      proximidad: proximidad && !contraRoca,
      contraRoca: !!contraRoca,
      roca: contraRoca?.asteroide,
      teledirigido: arma.tipo === 'torpedo',
      tipo: arma.tipo,
    })
    this.eventos.push({ tipo: 'disparo', pos: origen, arma: arma.tipo, equipo: n.equipo })
  }

  moverProyectiles(dt) {
    const lista = this.proyectiles
    for (let i = lista.length - 1; i >= 0; i--) {
      const p = lista[i]
      p.vida -= dt
      const o = p.objetivo
      if (o) {
        if (!o.viva) {
          p.objetivo = null
        } else {
          // Los que van a pegar persiguen al blanco (corrige el adelanto).
          const hacia = _v.copy(o.pos).sub(p.pos)
          const d = hacia.length()
          if (d <= Math.max(o.radio * 0.7, p.velocidad * dt)) {
            this.impactar(p, o)
            lista.splice(i, 1)
            continue
          }
          p.dir.lerp(hacia.divideScalar(d), p.teledirigido ? 0.08 : 0.5).normalize()
        }
      }
      p.pos.addScaledVector(p.dir, p.velocidad * dt)
      if (p.vida <= 0) {
        if (p.proximidad) this.detonarFlak(p)
        else if (p.contraRoca && !p.roca.destruido) {
          this.eventos.push({ tipo: 'impactoRoca', pos: p.pos.clone(), arma: p.tipo })
          // Torpedos y cañonazos golpean más fuerte la roca.
          const fuerza = p.tipo === 'torpedo' || p.tipo === 'cañon' ? 2 : 1
          if (this.terreno.dañar(p.roca, p.daño * fuerza)) this.eventos.push({ tipo: 'rocaDestruida', asteroide: p.roca })
        }
        lista.splice(i, 1)
      }
    }
  }

  // Daño en área a las rocas chicas (explosiones cerca del cinturón).
  dañarRocasCerca(pos, radio, daño) {
    for (const a of [...this.terreno.asteroides]) {
      const d = a.pos.distanceTo(pos) - a.radio
      if (d > radio) continue
      if (this.terreno.dañar(a, daño * (1 - Math.max(0, d) / radio))) this.eventos.push({ tipo: 'rocaDestruida', asteroide: a })
    }
  }

  detonarFlak(p) {
    const RADIO = 14
    this.eventos.push({ tipo: 'flak', pos: p.pos.clone(), equipo: p.autor.equipo })
    if (this.terreno.asteroides.length) this.dañarRocasCerca(p.pos, RADIO, p.daño * 0.5)
    for (const o of this.naves) {
      if (!o.viva || o.equipo === p.autor.equipo || o.esCapital) continue
      const d = o.pos.distanceTo(p.pos)
      if (d > RADIO + o.radio) continue
      const f = 1 - Math.max(0, d - o.radio) / RADIO
      this.impactar({ ...p, daño: p.daño * (0.25 + 0.75 * f), pos: p.pos }, o)
    }
  }

  impactar(p, o) {
    o.ultimoImpacto = this.tiempo
    o.batallon.atacadoEn = this.tiempo
    this.estadisticas[p.autor.equipo].daño += p.daño
    p.autor.batallon.dañoCausado += p.daño
    let resto = p.daño
    const enEscudo = Math.min(o.escudo, resto)
    o.escudo -= enEscudo
    resto -= enEscudo
    o.estructura -= resto
    this.eventos.push({ tipo: 'impacto', nave: o, pos: p.pos.clone(), escudo: resto === 0, arma: p.tipo })
    // Defensa propia: un batallón quieto devuelve el fuego (salvo evasivo).
    const b = o.batallon
    if (b.orden.tipo === 'quieto' && b.tactica !== 'evasiva' && p.autor.batallon.viva)
      b.orden = { tipo: 'atacar', objetivo: p.autor.batallon, automatico: true }
    if (o.estructura <= 0) this.destruir(o, p.autor)
  }

  destruir(o, autor) {
    o.viva = false
    o.estructura = 0
    o.escudo = 0
    o.deriva = o.adelante.clone().multiplyScalar(o.velocidad * 0.4).add(new THREE.Vector3().randomDirection().multiplyScalar(o.esCapital ? 3 : 10))
    o.ejeGiro = new THREE.Vector3().randomDirection()
    o.giroMuerte = (o.esCapital ? 0.12 : 2.5) * (0.5 + Math.random())
    this.estadisticas[o.equipo].perdidas++
    this.estadisticas[autor.equipo].destruidas++
    autor.batallon.bajas++
    this.eventos.push({ tipo: 'destruida', nave: o })
    if (!o.esCapital && this.terreno.asteroides.length) this.dañarRocasCerca(o.pos, 30, 60)
    if (!o.batallon.viva) this.eventos.push({ tipo: 'batallonPerdido', batallon: o.batallon })
  }

  regenerar(n, dt) {
    const calma = this.tiempo - n.ultimoImpacto
    if (calma > 5 && n.escudo < n.tipo.escudoMax)
      n.escudo = Math.min(n.tipo.escudoMax, n.escudo + n.tipo.escudoMax * 0.07 * dt)
    // Reparación de campo: las naves chicas se arreglan cerca de una capital
    // propia si no reciben fuego. Por eso vale la pena retirarse.
    if (!n.esCapital && calma > 6 && n.estructura < n.tipo.estructuraMax && this.cercaDeCapital(n))
      n.estructura = Math.min(n.tipo.estructuraMax, n.estructura + n.tipo.estructuraMax * 0.04 * dt)
  }

  cercaDeCapital(n) {
    for (const c of this.naves)
      if (c.viva && c.esCapital && c.equipo === n.equipo && c.pos.distanceToSquared(n.pos) < (c.radio + 260) ** 2) return true
    return false
  }

  comprobarFin() {
    const jugador = this.batallones.some((b) => b.equipo === JUGADOR && b.viva)
    const enemigo = this.batallones.some((b) => b.equipo === ENEMIGO && b.viva)
    if (!enemigo) this.terminada = 'victoria'
    else if (!jugador) this.terminada = 'derrota'
  }
}

export function radioBatallon(b, batalla) {
  const p = batalla.plantilla(b.faccion, b.tipo.clave)
  return p.radio * (b.tipo.porBatallon > 1 ? 3.2 * Math.sqrt(b.tipo.porBatallon) : 1.4)
}

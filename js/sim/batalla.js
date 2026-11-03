// Simulación de la batalla: naves, batallones, movimiento, formaciones y
// combate. No dibuja nada: expone el estado y emite eventos (disparo,
// impacto, destrucción) que el motor convierte en efectos.
import * as THREE from 'three'
import { TIPOS, PUNTERIA, PROYECTIL, TACTICAS, CAPITAL, multiplicadorDaño, FACCIONES, puedeFormar } from '../datos.js'
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
const _l = new THREE.Vector3()
const _c = new THREE.Vector3()
const _lq = new THREE.Quaternion()

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
    // Rasgo de la facción (ver FACCIONES en datos.js).
    const rasgo = FACCIONES[batallon.faccion].rasgo ?? {}
    this.escudoMax = this.tipo.escudoMax * (rasgo.escudo ?? 1)
    this.velocidadMax = this.tipo.velocidad * (rasgo.velocidad ?? 1)
    this.factorDaño = rasgo.daño ?? 1
    this.factorRegen = rasgo.regenEscudo ?? 1
    this.escudo = this.escudoMax
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
      sMax += n.escudoMax
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
  } else if (formacion === 'linea') {
    // En columna: así todas muestran la banda al enemigo que tienen al costado.
    for (let i = 0; i < n; i++) r.push(new THREE.Vector3(0, 0, ((n - 1) / 2 - i) * esp))
  } else if (formacion === 'cuna') {
    r.push(new THREE.Vector3(0, 0, 0))
    for (let i = 1; i < n; i++) {
      const fila = Math.ceil(i / 2)
      r.push(new THREE.Vector3((i % 2 ? -1 : 1) * fila * esp * 0.6, 0, -fila * esp * 0.75))
    }
  } else if (formacion === 'caja') {
    // Escalonada en altura, como las cajas de bombarderos.
    for (let i = 0; i < n; i++) r.push(new THREE.Vector3((i % 2 ? -0.5 : 0.5) * esp, (Math.floor(i / 2) % 2 ? 0.4 : -0.4) * esp, -Math.floor(i / 2) * esp * 0.6))
  } else if (formacion === 'pantalla') {
    const R = esp * Math.max(1, n / 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      r.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0))
    }
  } else if (formacion === 'tijera') {
    for (let i = 0; i < n; i++) r.push(new THREE.Vector3((i % 2 ? -0.8 : 0.8) * esp, 0, -Math.floor(i / 2) * esp))
  } else if (formacion === 'pinza') {
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

  // faccion: en la campaña un bando puede sumar naves de otra facción.
  agregarBatallon(equipo, tipo, centro, rumbo, faccion = this.facciones[equipo]) {
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
    return this.batallones.filter((b) => b.equipo !== equipo && b.viva && !b.decorado && (!soloVisibles || this.batallonVisible(equipo, b)))
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
        // Las piezas de una misión (cargueros, estaciones) emiten baliza.
        if (e.batallon.pieza) {
          vis.add(e)
          continue
        }
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

  // Disparar delata: el otro bando ve al tirador enseguida si tiene alguna
  // nave a menos de 1600 m, sin esperar la próxima pasada de sensores. Así
  // no aparecen disparos saliendo de la nada.
  delatar(n) {
    const vis = this.visibles[n.equipo === JUGADOR ? ENEMIGO : JUGADOR]
    if (vis.has(n)) return
    for (const o of this.naves)
      if (o.viva && o.equipo !== n.equipo && o.pos.distanceToSquared(n.pos) < 1600 * 1600) {
        vis.add(n)
        return
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
    // Un grupo mezclado viaja en Delta; cada batallón conserva su formación.
    const f0 = batallones[0].formacion
    const slots = slotsFormacion(formacion ?? (batallones.every((b) => b.formacion === f0) ? f0 : 'delta'), batallones.length, esp)
    // El más lento marca el ritmo (como un grupo de ataque de Homeworld).
    const tope = batallones.length > 1 ? Math.min(...batallones.map((b) => b.naves[0].velocidadMax)) : Infinity
    // Los más pesados al centro de la formación.
    const ordenados = [...batallones].sort((a, b) => b.tipo.largo - a.tipo.largo)
    ordenados.forEach((b, i) => {
      b.orden = { tipo: 'mover' }
      b.libre = true // una escuadrilla movida a mano deja de escoltar
      b.contacto = undefined // la Cuña vuelve a tener su primer golpe
      b.destino.copy(slots[i]).applyQuaternion(q).add(punto)
      b.rumbo.copy(rumbo)
      b.topeVelocidad = tope
      if (formacion && puedeFormar(b.tipo.clave, formacion)) b.formacion = formacion
      for (const n of b.naves) n.objetivo = null
    })
  }

  ordenarAtacar(batallones, objetivo) {
    for (const b of batallones) {
      if (b.equipo === objetivo.equipo) continue
      b.orden = { tipo: 'atacar', objetivo, desde: this.tiempo }
      b.pinzaCerrada = false
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

  cambiarTactica(batallones, tactica) {
    for (const b of batallones) b.tactica = tactica
  }

  // Solo cambian los batallones que pueden usarla. En Pinza se reparten en dos alas.
  cambiarFormacion(todos, formacion) {
    const batallones = todos.filter((b) => puedeFormar(b.tipo.clave, formacion))
    if (!batallones.length) return
    batallones.forEach((b, i) => {
      b.formacion = formacion
      b.ala = i % 2 ? -1 : 1
    })
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
      if (!this.tregua) for (const b of this.batallones) if (b.viva) this.pensarBatallon(b)
    }
    for (const n of this.naves) {
      if (n.viva) {
        // Después de una misión ganada la flota sigue su camino (cinemática).
        if (!enCurso) {
          if (this.desfile && n.tipo.velocidad) this.moverNave(n, dt)
          continue
        }
        if (n.tipo.velocidad) this.moverNave(n, dt)
        if (!this.tregua) this.dispararNave(n, dt)
        this.regenerar(n, dt)
        if (n.tipo.hangar && !this.tregua) this.operarHangar(n, dt)
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

  // --- Hangar de los portanaves -------------------------------------------------

  operarHangar(n, dt) {
    const h = n.tipo.hangar
    n.relojHangar = (n.relojHangar ?? h.primero) - dt
    if (n.relojHangar > 0) return
    n.relojHangar = h.intervalo
    n.lanzados ??= 0
    if (n.lanzados >= h.reserva || (n.escuadrilla && n.escuadrilla.vivas.length >= h.capacidad)) return
    n.lanzados++
    this.lanzarCaza(n, n.escuadrilla)
  }

  // Lanza un caza desde el portanaves a su escuadrilla; la primera vez la
  // arma. Si la escuadrilla cayó entera, renace con el caza nuevo y vuelve a
  // escoltar. BatallaRemota lo repite igual cuando el anfitrión avisa, para
  // que las listas de naves y batallones coincidan.
  lanzarCaza(portanaves, escuadrilla) {
    const h = portanaves.tipo.hangar
    const equipo = portanaves.equipo
    const faccion = this.facciones[equipo]
    let b = escuadrilla
    if (b && !b.viva) {
      b.orden = { tipo: 'quieto' }
      b.libre = false
      b.topeVelocidad = Infinity
      b.destino.copy(portanaves.pos)
    }
    if (!b) {
      const numero = (this.contador[equipo].escuadrilla = (this.contador[equipo].escuadrilla ?? 0) + 1)
      b = new Batallon(this.batallones.length + 1, equipo, faccion, h.tipo, numero)
      b.nombre = `Escuadrilla ${numero}`
      b.escuadrilla = true
      b.portanaves = portanaves
      b.rumbo.copy(portanaves.adelante)
      b.destino.copy(portanaves.pos)
      // Sale con la orden del portanaves: si está atacando, va al mismo blanco.
      const o = portanaves.batallon.orden
      if (o.tipo === 'atacar' && o.objetivo.viva) b.orden = { tipo: 'atacar', objetivo: o.objetivo, automatico: true }
      this.batallones.push(b)
      portanaves.escuadrilla = b
    }
    const p = this.plantilla(faccion, h.tipo)
    const r = portanaves.radio
    const pos = _w.set((Math.random() - 0.5) * r * 0.3, -r * 0.12, -r * 0.15).applyQuaternion(portanaves.quat).add(portanaves.pos)
    const nave = new Nave(b, h.tipo, p, pos, portanaves.quat)
    nave.lanzada = true
    nave.velocidad = nave.velocidadMax * 0.6
    nave.malla = this.crearMalla(faccion, h.tipo)
    b.naves.push(nave)
    this.naves.push(nave)
    this.eventos.push({ tipo: 'lanzamiento', nave, portanaves, batallon: b })
    return nave
  }

  // --- Efectos de las formaciones (ver FORMACIONES en datos.js) -----------------

  // Dónde cae un punto respecto de la nave: x a los costados, z proa y popa.
  relativo(n, punto) {
    return _l.copy(punto).sub(n.pos).applyQuaternion(_lq.copy(n.quat).invert())
  }

  factorVelocidad(b) {
    // La Cuña acelera hasta el primer contacto; después pelea normal.
    if (b.formacion === 'cuna') return b.contacto === undefined ? 1.2 : 1
    return b.formacion === 'caja' || b.formacion === 'tijera' ? 0.85 : 1
  }

  dañoCausado(n, obj) {
    const b = n.batallon
    if (b.formacion === 'linea') {
      const r = this.relativo(n, obj.pos)
      return Math.abs(r.x) > Math.abs(r.z) ? 1.1 : 1
    }
    if (b.formacion === 'cuna') {
      b.contacto ??= this.tiempo
      return this.tiempo - b.contacto < 8 ? 1.1 : 1
    }
    if (b.formacion === 'tijera') {
      if (obj.esCapital) return 0.8
      return obj.objetivo?.equipo === n.equipo ? 1.1 : 0.93
    }
    if (b.formacion === 'pinza') return this.enPinza(b, obj) ? 1.15 : 1
    return 1
  }

  // Otro batallón en Pinza ataca el mismo blanco desde un lado distinto.
  enPinza(b, obj) {
    const yo = _l.copy(b.centro(_c)).sub(obj.pos).normalize()
    for (const x of this.batallones) {
      if (x === b || x.equipo !== b.equipo || !x.viva || x.formacion !== 'pinza' || x.orden.objetivo !== obj.batallon) continue
      if (yo.dot(x.centro(_c).sub(obj.pos).normalize()) < 0.5) return true
    }
    return false
  }

  dañoRecibido(o, autor) {
    const b = o.batallon
    if (b.formacion === 'linea') {
      // Las naves chicas que entran por proa y popa escapan a las bandas.
      if (autor.esCapital) return 1
      const r = this.relativo(o, autor.pos)
      return Math.abs(r.z) > Math.abs(r.x) * 2 ? 1.1 : 1
    }
    if (b.formacion === 'cuna') return 1.05
    // La Caja se rompe si queda una sola nave.
    if (b.formacion === 'caja' && b.vivas.length > 1 && ['caza', 'corbeta'].includes(autor.tipo.clave)) return 0.88
    return 1
  }

  // Pantalla: anillo alrededor de la capital propia más cercana. Devuelve
  // false si no hay capital (entonces pelea como cualquier batallón).
  pantalla(b) {
    if (b.orden.tipo === 'mover' || (b.orden.tipo === 'atacar' && !b.orden.automatico)) return true
    const centro = b.centro(_c)
    if (!b.custodia?.viva) {
      b.custodia = null
      let d = Infinity
      for (const n of this.naves) {
        if (!n.viva || !n.esCapital || n.equipo !== b.equipo) continue
        const x = n.pos.distanceToSquared(centro)
        if (x < d) ((d = x), (b.custodia = n))
      }
    }
    const c = b.custodia
    if (!c) return false
    const a = b.id * 2.4
    const r = c.radio + 120
    b.destino.copy(c.pos).add(_l.set(Math.cos(a) * r, Math.sin(a * 1.7) * 50, Math.sin(a) * r))
    b.rumbo.copy(c.adelante)
    if (b.orden.tipo === 'atacar') {
      if (b.orden.objetivo.centro(_l).distanceTo(c.pos) > 650) b.orden = { tipo: 'quieto' }
      return true
    }
    let mejor = null
    let dMejor = 520
    for (const e of this.enemigosDe(b.equipo, true)) {
      const d = e.centro(_l).distanceTo(c.pos)
      if (d < dMejor) ((dMejor = d), (mejor = e))
    }
    if (mejor) b.orden = { tipo: 'atacar', objetivo: mejor, automatico: true }
    return true
  }

  // Movimiento propio de la formación mientras ataca.
  maniobraFormacion(n, b, destino) {
    if (b.orden.tipo !== 'atacar') return
    if (b.formacion === 'tijera') {
      // Las dos mitades se cruzan una y otra vez.
      const lado = _l.crossVectors(n.adelante, ARRIBA).normalize()
      destino.addScaledVector(lado, Math.sin(this.tiempo * 1.8 + (n.id % 2) * Math.PI) * 35)
    } else if (b.formacion === 'pinza' && b.ala && !b.pinzaCerrada) {
      // Primero el rodeo hacia su ala; recién después se cierra sobre el blanco.
      const blanco = b.orden.objetivo.centro(_c)
      const hacia = _l.copy(blanco).sub(b.centro(new THREE.Vector3()))
      const d = hacia.length()
      if (d < 600 || this.tiempo - (b.orden.desde ?? 0) > 25) b.pinzaCerrada = true
      else {
        hacia.divideScalar(d)
        destino.copy(blanco).addScaledVector(_u.crossVectors(hacia, ARRIBA).normalize(), b.ala * 520).addScaledVector(hacia, -150)
      }
    }
  }

  pensarBatallon(b) {
    // Escuadrilla sin órdenes del comandante: escolta a su portanaves.
    if (b.escuadrilla && !b.libre && b.orden.tipo === 'quieto' && b.portanaves.viva) {
      b.destino.copy(b.portanaves.pos).addScaledVector(ARRIBA, b.portanaves.radio * 0.6)
      b.rumbo.copy(b.portanaves.adelante)
    }
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
    if (b.formacion === 'pantalla' && this.pantalla(b)) return
    // Adquisición automática según la táctica.
    if (b.orden.tipo === 'quieto' && !b.pieza) {
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
    let velDeseada = Math.min(n.velocidadMax * this.factorVelocidad(b), b.topeVelocidad)
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
            velDeseada = Math.min(velDeseada, n.velocidadMax * 0.45)
          }
          llegar = false
        } else {
          // Naves chicas: cada tipo pelea a su manera (ver "maniobra" en datos.js).
          // Contra una capital, cazas y corbetas hacen pasadas: perseguirla u
          // orbitarla dentro del alcance de su flak sería suicida.
          const maniobra = obj.esCapital && t.maniobra !== 'pasada' ? 'pasada-suelta' : t.maniobra
          if (maniobra === 'persecucion') velDeseada = this.persecucion(n, obj, dist, dt, destino, velDeseada)
          else if (maniobra === 'orbita') this.orbita(n, obj, dist, destino)
          else if (maniobra === 'pasada') this.pasadaEnFormacion(n, obj, dt, destino)
          else this.pasadaSuelta(n, obj, dist, dt, destino)
          llegar = false
        }
      }
    } else {
      // Mover / quieto: ir al lugar en la formación del batallón.
      const q = quatHacia(b.rumbo, _q)
      // Las escuadrillas se reacomodan entre las vivas (se suman y caen cazas).
      const lista = b.escuadrilla ? b.vivas : b.naves
      const clave = b.formacion + lista.length
      if (b.slotsClave !== clave) {
        b.slotsClave = clave
        b.slots = slotsFormacion(b.formacion, lista.length, n.radio * 3.2)
      }
      destino.copy(b.slots[lista.indexOf(n)]).applyQuaternion(q).add(b.destino)
    }

    if (!n.esCapital && b.tactica === 'evasiva' && this.tiempo - b.atacadoEn < 2) {
      const f = this.tiempo * 2.3 + n.id
      destino.x += Math.sin(f) * 40
      destino.y += Math.cos(f * 1.3) * 30
    }
    this.maniobraFormacion(n, b, destino)
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
      } else velDeseada = Math.min(velDeseada, dist * (n.esCapital ? 0.22 : 0.9) + 1)
    }
    const anterior = n.adelante.clone()
    if (dist > 0.5 && velDeseada > 0) {
      aDestino.divideScalar(dist)
      if (this.terreno.asteroides.length)
        this.terreno.desviar(n.pos, aDestino, n.radio, Math.min(dist, n.esCapital ? 260 : 160))
      if (n.esCapital) {
        // Inercia: la velocidad de giro crece y decrece de a poco. Una capital
        // mal orientada tarda en corregir (y queda expuesta mientras tanto).
        const objetivoQ = quatHacia(aDestino, _q)
        const angulo = n.quat.angleTo(objetivoQ)
        const deseado = Math.min(t.giro, angulo * 1.2)
        n.velGiro = THREE.MathUtils.clamp(deseado, (n.velGiro ?? 0) - t.giro * 0.6 * dt, (n.velGiro ?? 0) + t.giro * 0.45 * dt)
        n.quat.rotateTowards(objetivoQ, n.velGiro * dt)
      } else n.quat.rotateTowards(quatHacia(aDestino, _q), t.giro * dt)
    }
    const adelante = n.adelante
    const alineado = dist > 0.5 ? Math.max(0, adelante.dot(aDestino)) : 1
    const objetivoVel = velDeseada * (n.esCapital ? alineado * alineado : Math.max(0.4, alineado))
    // Las capitales frenan más despacio de lo que aceleran (deriva).
    const freno = n.esCapital ? 0.7 : 1.5
    const dv = THREE.MathUtils.clamp(objetivoVel - n.velocidad, -t.aceleracion * freno * dt, t.aceleracion * dt)
    n.velocidad = Math.max(0, n.velocidad + dv)
    n.pos.addScaledVector(adelante, n.velocidad * dt)
    if (this.terreno.asteroides.length) this.terreno.expulsar(n.pos, n.radio)

    // Alabeo visual de los cazas en los giros.
    if (!n.esCapital) {
      const giroLateral = anterior.cross(adelante).y / Math.max(dt, 1e-3)
      n.alabeo = THREE.MathUtils.lerp(n.alabeo, THREE.MathUtils.clamp(-giroLateral * 0.6, -1.1, 1.1), 0.1)
    }
  }

  // --- Maniobras de las naves chicas -----------------------------------------

  // Pasada de ametrallamiento: se acerca adelantándose al blanco, se pasa de
  // largo, abre hacia un costado y vuelve. Es lo que hacen los cazas contra
  // las naves capitales.
  pasadaSuelta(n, obj, dist, dt, destino) {
    n.tiempoFase -= dt
    const distRuptura = obj.esCapital ? obj.radio + 25 : 35
    if (n.fase === 'acercarse') {
      const tVuelo = dist / PROYECTIL[n.tipo.armas[0].tipo].velocidad
      destino.copy(obj.pos).addScaledVector(obj.adelante, obj.velocidad * tVuelo)
      if (dist < distRuptura) {
        n.fase = 'romper'
        n.tiempoFase = (obj.esCapital ? 1.4 : 1.1) + Math.random() * 0.8
        const adelante = n.adelante
        const lateral = _u.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.8, Math.random() - 0.5)
        lateral.addScaledVector(adelante, -lateral.dot(adelante)).normalize()
        const largo = obj.esCapital ? 140 + obj.radio * 1.5 : 180
        n.puntoRuptura.copy(n.pos).addScaledVector(adelante, largo).addScaledVector(lateral, largo * 0.6)
      }
    } else {
      destino.copy(n.puntoRuptura)
      if (n.tiempoFase <= 0) n.fase = 'acercarse'
    }
  }

  // Persecución (cazas contra naves chicas): apunta a un punto detrás de la
  // cola del enemigo y, una vez ahí, iguala su velocidad para no pasarse.
  // Como el otro también gira, salen dogfights en espiral. Si queda
  // demasiado encima, rompe un instante para no chocar.
  persecucion(n, obj, dist, dt, destino, velDeseada) {
    n.tiempoFase -= dt
    if (n.fase === 'romper') {
      destino.copy(n.puntoRuptura)
      if (n.tiempoFase <= 0) n.fase = 'acercarse'
      return velDeseada
    }
    const cola = 30 + obj.radio * 2
    const tVuelo = dist / PROYECTIL.laser.velocidad
    destino.copy(obj.pos).addScaledVector(obj.adelante, obj.velocidad * tVuelo - cola)
    // ¿Ya está en la cola? (detrás del blanco y mirando hacia donde va)
    _u.copy(n.pos).sub(obj.pos)
    const detras = _u.dot(obj.adelante) < 0
    if (detras && dist < cola * 2.2) velDeseada = Math.min(velDeseada, Math.max(obj.velocidad * 1.05, 20))
    if (dist < obj.radio + 12) {
      n.fase = 'romper'
      n.tiempoFase = 0.5 + Math.random() * 0.4
      n.puntoRuptura.copy(n.pos).addScaledVector(n.adelante, 90).add(_u.randomDirection().multiplyScalar(50))
    }
    return velDeseada
  }

  // Órbita (corbetas): giran alrededor del blanco a toda velocidad, cada una
  // en su propio plano, metiéndose un poco hacia adentro para tenerlo en el
  // cono de sus ametralladoras laterales.
  orbita(n, obj, dist, destino) {
    if (!n.ejeOrbita) n.ejeOrbita = new THREE.Vector3(Math.random() - 0.5, 1.6, Math.random() - 0.5).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1)
    const radio = obj.esCapital ? obj.radio + 70 : 60
    const radial = _u.copy(n.pos).sub(obj.pos)
    if (radial.lengthSq() < 1) radial.set(1, 0, 0)
    radial.normalize()
    // Lejos: va directo. Cerca: tangente a la órbita, cerrando hacia adentro.
    if (dist > radio * 2.5) return destino.copy(obj.pos)
    const tangente = _w.crossVectors(n.ejeOrbita, radial).normalize()
    // Rumbo ~35° hacia adentro de la tangente: el blanco queda dentro del
    // cono de tiro. Si se metió demasiado, abre hacia afuera.
    const haciaAfuera = dist < radio * 0.6 ? 1.2 : 0
    destino
      .copy(obj.pos)
      .addScaledVector(radial, radio * haciaAfuera)
      .addScaledVector(tangente, radio * 0.7)
      .addScaledVector(obj.adelante, obj.velocidad * 0.5)
  }

  // Pasada en formación (bombarderos): todo el batallón se alinea lejos del
  // blanco, hace una pasada recta soltando torpedos y sale en una curva
  // amplia para volver a alinearse. Durante la aproximación son blancos
  // fáciles: para eso están los cazas de escolta.
  pasadaEnFormacion(n, obj, dt, destino) {
    const b = n.batallon
    const vivas = b.naves.filter((x) => x.viva)
    const lider = vivas[0]
    const i = vivas.indexOf(n)
    let p = b.pasada
    if (!p || p.objetivo !== obj.batallon) {
      const dir = obj.pos.clone().sub(b.centro(new THREE.Vector3())).normalize()
      p = b.pasada = { objetivo: obj.batallon, fase: 'formar', dir, t: 0, punto: new THREE.Vector3() }
      p.punto.copy(obj.pos).addScaledVector(dir, -(320 + obj.radio))
    }
    if (n === lider) p.t += dt
    // Desplazamiento lateral de cada nave en la fila.
    const lateral = _u.crossVectors(p.dir, ARRIBA).normalize().multiplyScalar((i - (vivas.length - 1) / 2) * (n.radio * 3))
    if (p.fase === 'formar') {
      destino.copy(p.punto).add(lateral)
      if (n === lider && (lider.pos.distanceTo(p.punto) < 70 || p.t > 9)) {
        p.fase = 'pasada'
        p.t = 0
        p.dir.copy(obj.pos).sub(lider.pos).normalize()
      }
    } else if (p.fase === 'pasada') {
      // Recta hacia el blanco, corrigiendo apenas.
      destino.copy(n.pos).addScaledVector(p.dir, 120).lerp(_w.copy(obj.pos).add(lateral), 0.25)
      const pasado = _w.copy(obj.pos).sub(lider.pos).dot(p.dir) < -(obj.radio + 50)
      if (n === lider && (pasado || p.t > 10)) {
        p.fase = 'salida'
        p.t = 0
        const costado = _w.crossVectors(p.dir, ARRIBA).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1)
        p.punto.copy(obj.pos).addScaledVector(p.dir, 300).addScaledVector(costado, 260).addScaledVector(ARRIBA, (Math.random() - 0.3) * 160)
      }
    } else {
      destino.copy(p.punto).add(lateral)
      if (n === lider && (lider.pos.distanceTo(p.punto) < 90 || p.t > 7)) {
        // Nueva aproximación desde donde quedaron.
        p.fase = 'formar'
        p.t = 0
        p.dir.copy(obj.pos).sub(lider.pos).normalize()
        p.punto.copy(obj.pos).addScaledVector(p.dir, -(320 + obj.radio))
      }
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
        // La nave más chica es la que se corre; las estructuras no se mueven.
        const pa = !a.tipo.velocidad ? 0 : !b.tipo.velocidad ? 1 : b.radio / (a.radio + b.radio)
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
    if (obj.batallon.formacion === 'tijera') acierto *= 0.92
    const impacta = Math.random() < acierto
    const daño = arma.daño * n.factorDaño * multiplicadorDaño(n.tipo.clave, obj.tipo.clave) * this.dañoCausado(n, obj) * (0.85 + Math.random() * 0.3)
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
    this.delatar(n)
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
      // Los que fallan se apagan poco después de pasar al blanco: si siguieran
      // de largo cruzarían el mapa vacío y parecerían disparos de la nada.
      vida: proximidad || contraRoca ? origen.distanceTo(apunta) / p.velocidad : impacta ? arma.alcance / p.velocidad + 1.2 : origen.distanceTo(apunta) / p.velocidad + 0.2,
      proximidad: proximidad && !contraRoca,
      contraRoca: !!contraRoca,
      roca: contraRoca?.asteroide,
      teledirigido: arma.tipo === 'torpedo',
      tipo: arma.tipo,
    })
    this.eventos.push({ tipo: 'disparo', pos: origen, arma: arma.tipo, equipo: n.equipo, autor: n, objetivo: obj, impacta })
  }

  moverProyectiles(dt) {
    const lista = this.proyectiles
    for (let i = lista.length - 1; i >= 0; i--) {
      const p = lista[i]
      p.vida -= dt
      const o = p.objetivo
      if (o) {
        if (!o.viva) {
          // El blanco ya cayó: el disparo se apaga enseguida.
          p.objetivo = null
          p.vida = Math.min(p.vida, 0.2)
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
    const daño = p.daño * this.dañoRecibido(o, p.autor)
    this.estadisticas[p.autor.equipo].daño += daño
    p.autor.batallon.dañoCausado += daño
    let resto = daño
    const enEscudo = Math.min(o.escudo, resto)
    o.escudo -= enEscudo
    resto -= enEscudo
    o.estructura -= resto
    this.eventos.push({ tipo: 'impacto', nave: o, pos: p.pos.clone(), escudo: resto === 0, arma: p.tipo })
    // Defensa propia: un batallón quieto devuelve el fuego (salvo evasivo).
    const b = o.batallon
    if (b.orden.tipo === 'quieto' && b.tactica !== 'evasiva' && !b.pieza && p.autor.batallon.viva)
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
    if (calma > 5 && n.escudo < n.escudoMax)
      n.escudo = Math.min(n.escudoMax, n.escudo + n.escudoMax * 0.07 * n.factorRegen * dt)
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
    if (this.mision) return // en la campaña decide la misión
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

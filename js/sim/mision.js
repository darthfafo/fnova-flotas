// Motor de misiones de la campaña. Toma la definición de un escenario
// (campana/escenarios.js), despliega flotas y piezas (cargueros, estaciones)
// y lleva objetivos y eventos. No dibuja nada: avisa por alTransmision y
// alCambio. Mientras hay misión, la Batalla no decide quién gana: decide esto.
import * as THREE from 'three'
import { ORDEN_TIPOS, TIPOS, CAPITAL } from '../datos.js'
import { JUGADOR, ENEMIGO } from './batalla.js'

const vec = (a) => new THREE.Vector3(...a)
const LLEGADA = 60 // a esta distancia una pieza da por alcanzado un punto de su ruta

export class Mision {
  constructor({ def, batalla, alTransmision, alCambio }) {
    this.def = def
    this.batalla = batalla
    this.alTransmision = alTransmision
    this.alCambio = alCambio
    this.ia = null
    this.t = 0
    this.activa = false
    this.piezas = {} // id → { b, def, tramo, pausa, salvada }
    this.eventos = (def.eventos ?? []).map((e) => ({ ...e, hecho: false, proximo: e.desde ?? e.cada }))
    this.objetivos = def.objetivos.map((o) => ({ ...o, estado: o.oculto ? 'oculto' : 'activo', dentro: 0 }))
    batalla.mision = this
  }

  // --- Despliegue ---------------------------------------------------------

  desplegar() {
    for (const p of this.def.piezas ?? []) this.agregarPieza(p)
    const propios = this.flota(JUGADOR, this.def.jugador)
    for (const g of [this.def.enemigo].flat()) if (g) this.flota(ENEMIGO, g)
    // Ninguna roca encima de una pieza o de la ruta de salida.
    const t = this.batalla.terreno
    const piezas = Object.values(this.piezas).map((p) => p.b.naves[0])
    t.asteroides = t.asteroides.filter((a) => piezas.every((n) => a.pos.distanceTo(n.pos) > a.radio + n.radio + 40))
    return propios
  }

  // Una fila de naves chicas adelante y las capitales detrás.
  flota(equipo, { flota, pos, rumbo, faccion }) {
    const centro = vec(pos)
    const dir = rumbo ? vec(rumbo).normalize() : new THREE.Vector3(0, 0, equipo === JUGADOR ? -1 : 1)
    const lado = new THREE.Vector3(-dir.z, 0, dir.x)
    const tipos = ORDEN_TIPOS.flatMap((k) => Array(flota[k] ?? 0).fill(k))
    const filas = [tipos.filter((k) => TIPOS[k].clase !== CAPITAL), tipos.filter((k) => TIPOS[k].clase === CAPITAL)]
    const lista = []
    filas.forEach((fila, f) => {
      const sep = f ? 190 : 100
      fila.forEach((k, i) => {
        const p = centro.clone().addScaledVector(lado, (i - (fila.length - 1) / 2) * sep).addScaledVector(dir, -f * 210)
        p.y += (i % 2 ? 1 : -1) * 18
        lista.push(this.batalla.agregarBatallon(equipo, k, p, dir, faccion))
      })
    })
    return lista
  }

  agregarPieza(d) {
    const equipo = d.equipo === 'jugador' ? JUGADOR : ENEMIGO
    const rumbo = d.rumbo ? vec(d.rumbo).normalize() : new THREE.Vector3(0, 0, equipo === JUGADOR ? -1 : 1)
    const b = this.batalla.agregarBatallon(equipo, d.tipo, vec(d.pos), rumbo, d.faccion)
    b.pieza = true
    b.decorado = !!d.decorado
    b.tactica = 'evasiva'
    b.nombre = d.nombre ?? b.tipo.nombre
    this.piezas[d.id] = { b, def: d, tramo: 0, pausa: 0, salvada: false, invulnerable: !!d.invulnerable || !!d.decorado }
  }

  // --- Marcha -------------------------------------------------------------

  iniciar() {
    this.activa = true
    this.batalla.tregua = false
    if (this.ia) this.ia.esperando = false
    for (const p of Object.values(this.piezas)) this.seguirRuta(p)
    this.avisar()
  }

  seguirRuta(p) {
    const punto = p.def.ruta?.[p.tramo]
    if (punto) this.batalla.ordenarMover([p.b], vec(punto.p))
  }

  actualizar(dt) {
    if (!this.activa || this.batalla.terminada) return
    this.t += dt
    for (const p of Object.values(this.piezas)) this.pieza(p, dt)
    for (const e of this.eventos) this.evento(e)
    // La IA enemiga va primero por lo que tenés que proteger.
    if (this.ia) this.ia.prioridad = Object.values(this.piezas).filter((p) => p.b.equipo === JUGADOR && p.b.viva && !p.def.decorado).map((p) => p.b)
    let cambio = false
    for (const o of this.objetivos) if (o.estado === 'activo') cambio = this.evaluar(o, dt) || cambio
    if (cambio) this.avisar()
    this.comprobarFin()
  }

  pieza(p, dt) {
    const n = p.b.naves[0]
    if (!n.viva) return
    if (p.invulnerable) {
      n.escudo = n.escudoMax
      n.estructura = n.tipo.estructuraMax
    }
    const punto = p.def.ruta?.[p.tramo]
    if (!punto) return
    if (p.pausa > 0) {
      p.pausa -= dt
      if (p.pausa <= 0) {
        p.tramo++
        this.seguirRuta(p)
      }
      return
    }
    if (n.pos.distanceTo(vec(punto.p)) > LLEGADA + (punto.margen ?? 0)) return
    if (punto.texto) this.transmitir(punto)
    if (punto.pausa) p.pausa = punto.pausa
    else if (p.tramo === p.def.ruta.length - 1) this.saltar(p, n)
    else {
      p.tramo++
      this.seguirRuta(p)
    }
  }

  // Llegó al punto de salto: desaparece a salvo.
  saltar(p, n) {
    p.salvada = true
    n.viva = false
    n.muerte = 99
    this.batalla.eventos.push({ tipo: 'salto', nave: n })
    this.transmitir({ quien: this.def.voz, texto: `${p.b.nombre} saltó a salvo.` })
  }

  evento(e) {
    if (e.cada) {
      const sigue = !e.mientras || this.objetivo(e.mientras)?.estado === 'activo'
      if (!sigue || this.t < e.proximo) return
      e.proximo = this.t + e.cada
    } else {
      if (e.hecho) return
      const listo = e.cuando ? this.objetivo(e.cuando)?.estado === 'cumplido' : this.t >= (e.t ?? 0)
      if (!listo) return
      e.hecho = true
    }
    if (e.texto) this.transmitir(e)
    if (e.oleada) this.flota(ENEMIGO, e.oleada)
    if (e.refuerzo) this.flota(JUGADOR, e.refuerzo)
    if (e.vulnerable) this.piezas[e.vulnerable].invulnerable = false
    if (e.activar) {
      const o = this.objetivo(e.activar)
      o.estado = 'activo'
      o.desde = this.t
      this.avisar()
    }
  }

  objetivo(id) {
    return this.objetivos.find((o) => o.id === id)
  }

  // Cuenta piezas: vivas, salvadas (saltaron) y destruidas.
  conteo(ids) {
    const r = { vivas: 0, salvadas: 0, caidas: 0, total: ids.length }
    for (const id of ids) {
      const p = this.piezas[id]
      if (p.salvada) r.salvadas++
      else if (p.b.viva) r.vivas++
      else r.caidas++
    }
    return r
  }

  // Devuelve true si cambió algo que el panel tenga que mostrar.
  evaluar(o, dt) {
    const antes = o.progreso
    if (o.tipo === 'destruir') {
      const c = this.conteo(o.piezas)
      o.progreso = o.piezas.length > 1 ? `${c.caidas}/${c.total}` : ''
      if (c.vivas === 0) o.estado = 'cumplido'
    } else if (o.tipo === 'proteger') {
      if (this.conteo(o.piezas).vivas < (o.minimo ?? o.piezas.length)) o.estado = 'fallido'
    } else if (o.tipo === 'escoltar') {
      const c = this.conteo(o.piezas)
      o.progreso = `${c.salvadas}/${o.minimo}`
      if (c.salvadas >= o.minimo) o.estado = 'cumplido'
      else if (c.salvadas + c.vivas < o.minimo) o.estado = 'fallido'
    } else if (o.tipo === 'interceptar') {
      const c = this.conteo(o.piezas)
      o.progreso = `${c.caidas}/${c.total - o.maximo}`
      if (c.salvadas > o.maximo) o.estado = 'fallido'
      else if (c.caidas >= c.total - o.maximo) o.estado = 'cumplido'
    } else if (o.tipo === 'resistir') {
      const resta = o.segundos - (this.t - (o.desde ?? 0))
      o.progreso = reloj(resta)
      if (resta <= 0) o.estado = 'cumplido'
    } else if (o.tipo === 'aniquilar') {
      const quedan = this.batalla.batallones.some((b) => b.equipo === ENEMIGO && b.viva && !b.pieza)
      const faltan = this.eventos.some((e) => !e.hecho && e.oleada && !e.cada)
      if (!quedan && !faltan) o.estado = 'cumplido'
    } else if (o.tipo === 'mantener') {
      // Hay que tener naves junto a la pieza; si se van, el enlace se corta de a poco.
      const centro = this.piezas[o.pieza].b.naves[0].pos
      const cerca = this.batalla.naves.some((n) => n.viva && n.equipo === JUGADOR && !n.batallon.pieza && n.pos.distanceTo(centro) < o.radio)
      o.dentro = Math.max(0, o.dentro + (cerca ? dt : -dt * 0.5))
      o.progreso = `${Math.min(100, Math.floor((o.dentro / o.segundos) * 100))}%`
      if (o.dentro >= o.segundos) o.estado = 'cumplido'
    }
    if (o.estado === 'activo' && o.limite && this.t > o.limite) o.estado = 'fallido'
    return o.estado !== 'activo' || o.progreso !== antes
  }

  comprobarFin() {
    const b = this.batalla
    if (this.objetivos.some((o) => o.estado === 'fallido')) return this.terminar('derrota')
    const propios = b.batallones.some((x) => x.equipo === JUGADOR && x.viva && !x.pieza)
    if (!propios && !this.eventos.some((e) => !e.hecho && e.refuerzo)) return this.terminar('derrota')
    if (this.objetivos.every((o) => o.continuo || o.estado === 'cumplido')) this.terminar('victoria')
  }

  terminar(resultado) {
    const b = this.batalla
    b.terminada = resultado
    this.avisar()
    if (resultado !== 'victoria') return
    // La flota sigue su rumbo mientras corre el relato final.
    b.desfile = true
    const propios = b.batallones.filter((x) => x.equipo === JUGADOR && x.viva && !x.pieza)
    for (const x of b.batallones) if (x.viva) ((x.orden = { tipo: 'quieto' }), x.destino.copy(x.centro()))
    if (propios.length) b.ordenarMover(propios, b.batallones.find((x) => propios.includes(x)).centro().add(new THREE.Vector3(0, 30, -500)))
  }

  transmitir({ quien, texto }) {
    this.alTransmision?.(quien ?? this.def.voz, texto)
  }

  avisar() {
    this.alCambio?.(this.objetivos.filter((o) => o.estado !== 'oculto'))
  }

  // --- Para la cámara y el HUD ------------------------------------------------

  foco(nombre) {
    if (Array.isArray(nombre)) return vec(nombre)
    const p = this.piezas[nombre]
    if (p) return p.b.naves[0].pos
    const equipo = nombre === 'enemigo' ? ENEMIGO : JUGADOR
    const lista = this.batalla.naves.filter((n) => n.viva && n.equipo === equipo && !n.batallon.pieza)
    if (!lista.length) return null
    const c = new THREE.Vector3()
    for (const n of lista) c.add(n.pos)
    return c.divideScalar(lista.length)
  }

  // Lo que se marca en pantalla: piezas de objetivos activos y puntos de salto.
  marcas() {
    const r = []
    for (const o of this.objetivos) {
      if (o.estado !== 'activo') continue
      for (const id of o.piezas ?? (o.pieza ? [o.pieza] : [])) {
        const p = this.piezas[id]
        if (!p.b.viva) continue
        const propio = p.b.equipo === JUGADOR
        r.push({ pos: p.b.naves[0].pos, texto: p.b.nombre, propio })
        const fin = p.def.ruta?.at(-1)
        if (fin && o.tipo === 'escoltar') r.push({ pos: vec(fin.p), texto: 'Punto de salto', propio: true })
      }
    }
    return r
  }
}

function reloj(s) {
  const t = Math.max(0, Math.ceil(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

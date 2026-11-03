// Comandante enemigo. Cada cierto tiempo (según la dificultad) revisa sus
// batallones:
//   · Retirada: los batallones muy dañados se repliegan junto a sus naves
//     capitales para repararse y vuelven cuando recuperan el escudo.
//   · Escolta: algunos batallones chicos cuidan a las capitales y atacan a
//     lo que se les acerque (sobre todo Bombarderos).
//   · Flanqueo: en Difícil, los batallones rápidos dan un rodeo amplio y
//     entran por el costado mientras el grueso avanza de frente.
//   · Marcha: la flota avanza junta hasta hacer contacto; las naves chicas
//     no se adelantan solas a morir contra el enemigo entero.
//   · Blancos: busca las contras, remata heridos y concentra el fuego. Cazas
//     y Corbetas no se tiran contra el flak mientras haya naves chicas que
//     cazar, y cuidan a los Bombarderos propios.
// Solo conoce lo que tiene en sus sensores: si te escondés en una nebulosa
// avanza hacia donde te vio por última vez.
import * as THREE from 'three'
import { DIFICULTADES, multiplicadorDaño } from '../datos.js'
import { ENEMIGO, JUGADOR } from './batalla.js'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

const CONFIG = {
  facil: { retirada: false, escolta: false, flanqueo: false, concentrar: false, formaciones: false },
  normal: { retirada: true, escolta: true, flanqueo: false, concentrar: true, formaciones: true },
  dificil: { retirada: true, escolta: true, flanqueo: true, concentrar: true, formaciones: true },
}

export class ComandanteIA {
  // equipo: el bando que maneja (ENEMIGO en una partida; los dos en la
  // batalla de fondo de la portada).
  constructor(batalla, dificultad, equipo = ENEMIGO) {
    this.batalla = batalla
    this.equipo = equipo
    // Hacia dónde está el rival y hacia dónde queda "atrás" para este bando.
    this.frente = equipo === ENEMIGO ? 1 : -1
    this.config = DIFICULTADES[dificultad]
    this.tactica = CONFIG[dificultad]
    this.reloj = 4 // unos segundos de calma antes de avanzar
    this.fase = 'despliegue'
    this.esperando = false // el tutorial frena a la IA hasta terminar
    this.ultimaPosicionRival = null
    this.roles = new Map() // batallón → 'linea' | 'escolta' | 'flanco'
    this.prioridad = [] // campaña: batallones que hay que atacar primero
    this.marcha = 50 // segundos, como mucho, de avance en bloque antes de soltarse
  }

  propios() {
    return this.batalla.batallones.filter((x) => x.equipo === this.equipo && x.viva && !x.pieza)
  }

  centroDe(lista) {
    const c = new THREE.Vector3()
    for (const b of lista) c.add(b.centro(_a))
    return lista.length ? c.divideScalar(lista.length) : c
  }

  asignarRoles() {
    const propios = this.propios()
    const capitales = propios.filter((b) => b.tipo.clase === 'capital')
    const chicos = propios.filter((b) => b.tipo.clase !== 'capital' && b.tipo.clave !== 'bombardero')
    // Un batallón de escolta por capital (si hay).
    let escoltas = this.tactica.escolta ? capitales.length : 0
    let flancos = this.tactica.flanqueo ? Math.floor(chicos.length / 3) : 0
    for (const b of propios) this.roles.set(b, 'linea')
    for (const b of chicos) {
      if (escoltas > 0 && b.tipo.clave !== 'corbeta') (this.roles.set(b, 'escolta'), escoltas--)
      else if (flancos > 0) (this.roles.set(b, 'flanco'), flancos--)
    }
  }

  actualizar(dt) {
    if (this.esperando) return
    const b = this.batalla
    this.reloj -= dt
    this.marcha -= dt
    if (this.reloj > 0) return
    this.reloj = this.config.reaccion * (0.8 + Math.random() * 0.4)

    const propios = this.propios()
    if (!propios.length) return
    const visibles = b.enemigosDe(this.equipo, true)
    if (visibles.length) this.ultimaPosicionRival = this.centroDe(visibles)

    if (this.fase === 'despliegue') {
      this.asignarRoles()
      this.fase = 'avance'
      this.avanzar(propios)
      this.reloj = 6
      return
    }

    // Sin nada a la vista: avanzar a donde se los vio por última vez.
    if (!visibles.length) {
      const ociosos = propios.filter((p) => p.orden.tipo === 'quieto' && !p.retirada)
      if (ociosos.length) this.avanzar(ociosos)
      return
    }

    if (this.tactica.formaciones) for (const p of propios) this.elegirFormacion(p)
    const capitales = propios.filter((p) => p.tipo.clase === 'capital')
    if (this.enMarcha(propios, capitales, visibles)) return
    const bombarderos = propios.filter((p) => p.tipo.clave === 'bombardero')
    const amenazas = this.amenazasA([...capitales, ...bombarderos], visibles)

    for (const p of propios) {
      if (this.tactica.retirada && this.gestionarRetirada(p, capitales)) continue
      const rol = this.roles.get(p) ?? 'linea'

      // Flanqueo: primero el rodeo, después al ataque.
      if (rol === 'flanco' && p.flanco !== 'hecho') {
        if (!p.flanco) {
          this.flanquear(p)
          continue
        }
        const cerca = visibles.some((v) => v.centro(_b).distanceTo(p.centro(_a)) < 500)
        if (p.orden.tipo === 'mover' && !cerca) continue
        p.flanco = 'hecho'
        p.tactica = 'agresiva'
      }

      // Escoltas: si algo amenaza a una capital, van por eso.
      if (rol === 'escolta' && amenazas.length) {
        const peor = amenazas[0]
        if (p.orden.objetivo !== peor) b.ordenarAtacar([p], peor)
        continue
      }
      if (p.formacion === 'pantalla' && p.orden.tipo !== 'atacar') continue
      if (rol === 'escolta' && capitales.length && p.orden.tipo !== 'atacar') {
        // Sin amenazas, se queda cerca de su capital.
        const c = capitales[0].centro(_a)
        if (p.centro(_b).distanceTo(c) > 300) b.ordenarMover([p], c.clone().add(new THREE.Vector3(0, 60, 0)))
        continue
      }

      const actual = p.orden.tipo === 'atacar' ? p.orden.objetivo : null
      if (actual?.viva && !p.orden.automatico && Math.random() < 0.65) continue
      const mejor = this.elegirBlanco(p, visibles, amenazas)
      if (mejor && mejor !== actual) b.ordenarAtacar([p], mejor)
    }
  }

  // Cada nave en la formación que le sirve; también los que llegan después.
  elegirFormacion(p) {
    if (p.formacionIA) return
    p.formacionIA = true
    const k = p.tipo.clave
    if (p.tipo.clase === 'capital') p.formacion = 'linea'
    else if (k === 'bombardero') p.formacion = 'caja'
    else if (k === 'corbeta') p.formacion = 'cuna'
    else p.formacion = this.roles.get(p) === 'escolta' ? 'pantalla' : 'tijera'
  }

  // Avance en bloque: con capitales en la flota, nadie se suelta hasta que el
  // enemigo está cerca de la línea o alguien ya está peleando.
  enMarcha(propios, capitales, visibles) {
    if (this.marcha <= 0 || !capitales.length) return false
    const centro = this.centroDe(capitales)
    const contacto = visibles.some((v) => v.centro(_b).distanceTo(centro) < 750) || propios.some((p) => this.batalla.tiempo - p.atacadoEn < 3)
    if (contacto) {
      this.marcha = 0
      return false
    }
    const destino = this.prioridad[0]?.centro() ?? this.centroDe(visibles)
    this.batalla.ordenarMover(propios, destino)
    return true
  }

  avanzar(lista) {
    const destino = this.prioridad[0]?.centro() ?? this.ultimaPosicionRival ?? new THREE.Vector3(0, 0, 900 * this.frente)
    const linea = lista.filter((p) => this.roles.get(p) !== 'flanco' || p.flanco === 'hecho')
    const flancos = lista.filter((p) => this.roles.get(p) === 'flanco' && p.flanco !== 'hecho')
    if (linea.length) this.batalla.ordenarMover(linea, destino.clone())
    for (const f of flancos) this.flanquear(f)
  }

  // Rodeo amplio hacia el costado más cercano del rival.
  flanquear(p) {
    const objetivo = this.ultimaPosicionRival ?? new THREE.Vector3(0, 0, 900 * this.frente)
    const c = p.centro(_a)
    const lado = c.x >= objetivo.x ? 1 : -1
    const punto = objetivo.clone().add(new THREE.Vector3(lado * 750, 80, -150 * this.frente))
    this.batalla.ordenarMover([p], punto)
    p.tactica = 'evasiva' // no se engancha en el camino
    p.flanco = 'en camino'
  }

  gestionarRetirada(p, capitales) {
    const salud = p.salud()
    const umbral = p.tipo.clase === 'capital' ? 0.25 : 0.35
    if (p.retirada) {
      // Vuelve cuando recuperó el escudo (y algo de estructura si hay reparación).
      if (salud.escudo > 0.9 && salud.estructura > umbral + 0.15) {
        p.retirada = false
        p.tactica = 'agresiva'
        return false
      }
      return true
    }
    // Sin una capital donde repararse no hay a dónde ir: se pelea hasta el final.
    const refugio = capitales.find((c) => c !== p)
    if (salud.estructura > umbral || !refugio) return false
    const punto = refugio.centro(_a).clone().add(new THREE.Vector3(0, 80, -150 * this.frente))
    this.batalla.ordenarMover([p], punto)
    p.tactica = 'evasiva'
    p.retirada = true
    return true
  }

  // Batallones rivales cerca de las capitales propias, Bombarderos primero.
  amenazasA(capitales, visibles) {
    const r = []
    for (const v of visibles) {
      const cv = v.centro(_b)
      for (const c of capitales)
        if (cv.distanceTo(c.centro(_a)) < 650) {
          r.push(v)
          break
        }
    }
    return r.sort((x, y) => (y.tipo.clave === 'bombardero') - (x.tipo.clave === 'bombardero'))
  }

  elegirBlanco(p, visibles, amenazas) {
    const c = p.centro(_a).clone()
    let mejor = null
    let puntaje = -Infinity
    // Cazas y Corbetas contra una capital solo cuando no queda nada chico.
    const cazador = p.tipo.clase !== 'capital' && p.tipo.clave !== 'bombardero'
    const quedanChicas = visibles.some((r) => r.tipo.clase !== 'capital')
    for (const r of visibles) {
      const d = r.centro(_b).distanceTo(c)
      let s = -d / 400
      if (this.config.usaContras) {
        s += (multiplicadorDaño(p.tipo.clave, r.tipo.clave) - 1) * 4
        s -= (multiplicadorDaño(r.tipo.clave, p.tipo.clave) - 1) * 1.5
        s += (1 - r.salud().estructura) * 1.5 // rematar heridos
        if (cazador && quedanChicas && r.tipo.clase === 'capital') s -= 2.5
      }
      if (this.tactica.concentrar) {
        // Concentrar el fuego: suma si otros batallones propios ya le tiran.
        const aliados = this.batalla.batallones.filter((x) => x.equipo === this.equipo && x.viva && x.orden.objetivo === r).length
        s += Math.min(aliados, 3) * 0.8
        if (amenazas.includes(r)) s += 1.5
      }
      if (this.prioridad.includes(r)) s += 2.5
      s += Math.random() * 0.5
      if (s > puntaje) {
        puntaje = s
        mejor = r
      }
    }
    return mejor
  }
}

export { JUGADOR }

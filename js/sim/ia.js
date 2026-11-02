// Comandante enemigo. Cada cierto tiempo (según la dificultad) revisa sus
// batallones y les asigna blanco: en Normal y Difícil busca las contras
// (Bombarderos a las capitales, Corbetas a los Cazas…); en Fácil ataca lo
// que tenga más cerca.
import * as THREE from 'three'
import { DIFICULTADES, multiplicadorDaño } from '../datos.js'
import { ENEMIGO } from './batalla.js'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

export class ComandanteIA {
  constructor(batalla, dificultad) {
    this.batalla = batalla
    this.config = DIFICULTADES[dificultad]
    this.reloj = 4 // unos segundos de calma antes de avanzar
    this.avanzando = false
  }

  actualizar(dt) {
    const b = this.batalla
    this.reloj -= dt
    if (this.reloj > 0) return
    this.reloj = this.config.reaccion * (0.8 + Math.random() * 0.4)

    const propios = b.batallones.filter((x) => x.equipo === ENEMIGO && x.viva)
    const rivales = b.enemigosDe(ENEMIGO)
    if (!propios.length || !rivales.length) return

    if (!this.avanzando) {
      // Avanza en bloque hacia el centro de la flota rival.
      this.avanzando = true
      const centro = new THREE.Vector3()
      for (const r of rivales) centro.add(r.centro(_a))
      centro.divideScalar(rivales.length)
      b.ordenarMover(propios, centro, 'garra')
      this.reloj = 6
      return
    }

    for (const p of propios) {
      const actual = p.orden.tipo === 'atacar' ? p.orden.objetivo : null
      // Rara vez cambia de blanco si el actual sigue vivo y es bueno.
      if (actual?.viva && Math.random() < 0.7) continue
      const c = p.centro(_a)
      let mejor = null
      let puntaje = -Infinity
      for (const r of rivales) {
        const d = r.centro(_b).distanceTo(c)
        let s = -d / 400
        if (this.config.usaContras) {
          s += (multiplicadorDaño(p.tipo.clave, r.tipo.clave) - 1) * 4
          s -= (multiplicadorDaño(r.tipo.clave, p.tipo.clave) - 1) * 1.5
          const salud = r.salud()
          s += (1 - salud.estructura) * 1.5 // rematar heridos
        }
        s += Math.random() * 0.5
        if (s > puntaje) {
          puntaje = s
          mejor = r
        }
      }
      if (mejor) b.ordenarAtacar([p], mejor)
    }
  }
}

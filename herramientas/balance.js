// Banco de pruebas de balance. Desde la consola del juego (con los modelos
// ya cargados):
//   const B = await import('/herramientas/balance.js')
//   B.tablaDuelos()            // cada tipo contra cada tipo, a igual costo
//   B.enfrentar({caza: 4}, {corbeta: 4}, 6)
// Corre la simulación sin dibujar nada: ambos bandos en táctica agresiva,
// se buscan solos.
import * as THREE from 'three'
import { Batalla, JUGADOR, ENEMIGO } from '../js/sim/batalla.js'
import { plantilla } from '../js/motor/modelos.js'
import { TIPOS, ORDEN_TIPOS, multiplicadorDaño } from '../js/datos.js'

const crearMalla = () => null

function valor(batalla, equipo) {
  let v = 0
  for (const n of batalla.naves)
    if (n.viva && n.equipo === equipo) v += (n.tipo.costo / n.tipo.porBatallon) * (n.estructura / n.tipo.estructuraMax)
  return v
}

function costo(flota) {
  return Object.entries(flota).reduce((s, [k, c]) => s + TIPOS[k].costo * c, 0)
}

export function batallaUnica(flotaA, flotaB, topeSegundos = 300) {
  const b = new Batalla({ faccionJugador: 'guardianes', faccionEnemiga: 'inquisidores', plantilla, crearMalla })
  for (const [equipo, flota, z] of [[JUGADOR, flotaA, 500], [ENEMIGO, flotaB, -500]]) {
    const lista = ORDEN_TIPOS.flatMap((k) => Array(flota[k] ?? 0).fill(k))
    lista.forEach((k, i) => {
      const x = (i - (lista.length - 1) / 2) * 110
      b.agregarBatallon(equipo, k, new THREE.Vector3(x, (Math.random() - 0.5) * 40, z + (Math.random() - 0.5) * 60), new THREE.Vector3(0, 0, -Math.sign(z)))
    })
  }
  // Blancos con el mismo criterio que la IA en Normal: cerca y, sobre todo,
  // donde el batallón tiene ventaja (si no, las flotas mixtas desperdician
  // sus contras y la prueba favorece a las flotas de un solo tipo).
  const reasignar = (enBloque) => {
    for (const bat of b.batallones) {
      if (enBloque[bat.equipo]) continue
      if (!bat.viva || (bat.orden.tipo === 'atacar' && bat.orden.objetivo.viva && !bat.orden.automatico)) continue
      const c = bat.centro()
      let mejor = null
      let puntaje = -Infinity
      for (const e of b.enemigosDe(bat.equipo)) {
        const s =
          -e.centro().distanceTo(c) / 400 +
          (multiplicadorDaño(bat.tipo.clave, e.tipo.clave) - 1) * 4 -
          (multiplicadorDaño(e.tipo.clave, bat.tipo.clave) - 1) * 1.5
        if (s > puntaje) (puntaje = s), (mejor = e)
      }
      if (mejor) b.ordenarAtacar([bat], mejor)
    }
  }
  // Cada bando avanza en bloque (a la velocidad del más lento) y recién
  // se suelta a atacar cuando el enemigo está cerca, como haría un jugador.
  const centroFlota = (equipo) => {
    const c = new THREE.Vector3()
    let k = 0
    for (const n of b.naves) if (n.viva && n.equipo === equipo) c.add(n.pos), k++
    return c.divideScalar(Math.max(1, k))
  }
  const enBloque = [true, true]
  for (const e of [JUGADOR, ENEMIGO]) b.ordenarMover(b.batallones.filter((x) => x.equipo === e), centroFlota(1 - e))
  const PASO = 1 / 30
  let t = 0
  while (!b.terminada && t < topeSegundos) {
    if (Math.round(t * 30) % 15 === 0) {
      for (const e of [JUGADOR, ENEMIGO]) {
        if (!enBloque[e]) continue
        const propios = b.batallones.filter((x) => x.equipo === e && x.viva)
        const atacado = propios.some((x) => b.tiempo - x.atacadoEn < 1)
        if (atacado || centroFlota(e).distanceTo(centroFlota(1 - e)) < 450) {
          enBloque[e] = false
          b.ordenarDetener(propios)
        }
      }
      reasignar(enBloque)
    }
    b.paso(PASO)
    b.eventos.length = 0
    t += PASO
  }
  const va = valor(b, JUGADOR) / costo(flotaA)
  const vb = valor(b, ENEMIGO) / costo(flotaB)
  return { gana: b.terminada === 'victoria' ? 'A' : b.terminada === 'derrota' ? 'B' : '-', t: Math.round(t), restoA: va, restoB: vb }
}

export function enfrentar(flotaA, flotaB, repeticiones = 6) {
  let a = 0, bb = 0, resto = 0, t = 0
  for (let i = 0; i < repeticiones; i++) {
    const r = batallaUnica(flotaA, flotaB)
    if (r.gana === 'A') a++
    if (r.gana === 'B') bb++
    resto += r.restoA - r.restoB // >0: A terminó con más valor relativo
    t += r.t
  }
  return { A: a, B: bb, margen: +(resto / repeticiones).toFixed(2), t: Math.round(t / repeticiones) }
}

// Duelos a igual presupuesto (redondeado a batallones enteros).
export function tablaDuelos(presupuesto = 2800, repeticiones = 4) {
  const filas = {}
  for (const a of ORDEN_TIPOS) {
    filas[a] = {}
    for (const b of ORDEN_TIPOS) {
      if (a === b) {
        filas[a][b] = '·'
        continue
      }
      const fa = { [a]: Math.max(1, Math.round(presupuesto / TIPOS[a].costo)) }
      const fb = { [b]: Math.max(1, Math.round(presupuesto / TIPOS[b].costo)) }
      const r = enfrentar(fa, fb, repeticiones)
      // margen: valor que le quedó a la fila menos el que le quedó a la columna
      filas[a][b] = `${r.A}-${r.B} ${r.margen > 0 ? '+' : ''}${r.margen}`
    }
  }
  return filas
}

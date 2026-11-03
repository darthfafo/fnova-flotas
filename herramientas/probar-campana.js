// Juega los escenarios de la campaña sin dibujar: la IA maneja a los dos
// bandos y va por los objetivos. Desde la consola del juego:
//   const P = await import('/herramientas/probar-campana.js'); P.probarTodos()
import { Batalla, JUGADOR } from '../js/sim/batalla.js'
import { Terreno } from '../js/sim/terreno.js'
import { Mision } from '../js/sim/mision.js'
import { ComandanteIA } from '../js/sim/ia.js'
import { plantilla } from '../js/motor/modelos.js'
import { ESCENARIOS, mision } from '../js/campana/escenarios.js'

export function probar(escenario, faccion, tope = 900) {
  const def = mision(escenario, faccion)
  const b = new Batalla({ faccionJugador: faccion, faccionEnemiga: def.rival, plantilla, crearMalla: () => null, terreno: new Terreno(def.mapa, 1, def.semilla) })
  const m = new Mision({ def, batalla: b })
  m.desplegar()
  const rival = new ComandanteIA(b, 'normal')
  const yo = new ComandanteIA(b, 'normal', JUGADOR)
  m.ia = rival
  m.iniciar()
  const paso = 1 / 30
  for (let i = 0; i < tope * 30 && !b.terminada; i++) {
    b.paso(paso)
    rival.actualizar(paso)
    yo.actualizar(paso)
    m.actualizar(paso)
    b.eventos.length = 0
    if (i % 30) continue
    // El "jugador" va por las piezas de los objetivos activos.
    const activos = m.objetivos.filter((o) => o.estado === 'activo')
    yo.prioridad = activos.flatMap((o) => (['destruir', 'interceptar'].includes(o.tipo) ? o.piezas : [])).map((id) => m.piezas[id].b).filter((x) => x.viva && x.equipo !== JUGADOR && !m.piezas[Object.keys(m.piezas).find((k) => m.piezas[k].b === x)].invulnerable)
    const enlace = activos.find((o) => o.tipo === 'mantener')
    if (enlace) {
      const propios = b.batallones.filter((x) => x.equipo === JUGADOR && x.viva && !x.pieza)
      const lejos = propios.filter((x) => x.centro().distanceTo(m.foco(enlace.pieza)) > 300 && x.orden.tipo !== 'mover')
      if (lejos.length) b.ordenarMover(lejos, m.foco(enlace.pieza).clone().setZ(m.foco(enlace.pieza).z + 200))
    }
  }
  const vivas = b.naves.filter((n) => n.viva && n.equipo === JUGADOR && !n.batallon.pieza).length
  return `${escenario.numero} ${faccion.slice(0, 5)}: ${b.terminada ?? 'SIN TERMINAR'} ${m.t.toFixed(0)}s, quedan ${vivas} · ${m.objetivos.map((o) => `${o.id}=${o.estado}`).join(' ')}`
}

export function probarTodos(veces = 2) {
  const r = []
  for (const e of ESCENARIOS) for (const f of ['guardianes', 'inquisidores']) for (let i = 0; i < veces; i++) r.push(probar(e, f))
  return r.join('\n')
}

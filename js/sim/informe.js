// Informe de fin de batalla: qué tenía cada bando, qué le quedó, el
// batallón más efectivo y un puntaje. El puntaje está pensado para la
// futura tabla de posiciones: premia destruir valor enemigo, conservar la
// flota propia y ganar rápido, y se multiplica según la dificultad.
import { ORDEN_TIPOS } from '../datos.js'
import { JUGADOR, ENEMIGO } from './batalla.js'

const MULTIPLICADOR = { facil: 0.75, normal: 1, dificil: 1.5 }

function valorNave(n) {
  return n.tipo.costo / n.tipo.porBatallon
}

export function armarInforme({ resultado, batalla, segundos, dificultad }) {
  const lados = [JUGADOR, ENEMIGO].map((equipo) => {
    // Los cazas lanzados por portanaves no cuentan: son parte del portanaves.
    const naves = batalla.naves.filter((n) => n.equipo === equipo && !n.lanzada)
    const porTipo = ORDEN_TIPOS.map((clave) => {
      const delTipo = naves.filter((n) => n.tipo.clave === clave)
      return { clave, nombre: delTipo[0]?.tipo.nombre, total: delTipo.length, quedan: delTipo.filter((n) => n.viva).length }
    }).filter((t) => t.total)
    const valorInicial = naves.reduce((s, n) => s + valorNave(n), 0)
    const valorFinal = naves.filter((n) => n.viva).reduce((s, n) => s + valorNave(n), 0)
    return {
      equipo,
      faccion: batalla.facciones[equipo],
      porTipo,
      naves: naves.length,
      quedan: naves.filter((n) => n.viva).length,
      valorInicial,
      valorFinal,
      conservado: valorInicial ? valorFinal / valorInicial : 0,
      daño: batalla.estadisticas[equipo].daño,
    }
  })
  const [yo, rival] = lados
  const victoria = resultado === 'victoria'

  // Batallón propio más efectivo (por daño causado).
  const propios = batalla.batallones.filter((b) => b.equipo === JUGADOR)
  const destacado = propios.reduce((m, b) => (b.dañoCausado > (m?.dañoCausado ?? -1) ? b : m), null)

  const destruido = Math.round(rival.valorInicial - rival.valorFinal)
  const supervivencia = victoria ? Math.round(yo.valorInicial * yo.conservado * 0.5) : 0
  // Ganar rápido suma hasta un 25% del tamaño de la flota rival; se escala
  // con el tamaño de la batalla para que una Épica no quede castigada.
  const tiempoPar = 90 + rival.valorInicial / 60
  const rapidez = victoria ? Math.round(rival.valorInicial * 0.25 * Math.max(0, 1 - segundos / (tiempoPar * 2))) : 0
  const multiplicador = MULTIPLICADOR[dificultad] ?? 1
  const puntaje = Math.round((destruido + supervivencia + rapidez) * multiplicador)

  let calificacion
  if (victoria) calificacion = yo.conservado > 0.7 ? 'Victoria aplastante' : yo.conservado > 0.35 ? 'Victoria sólida' : 'Victoria pírrica'
  else calificacion = rival.conservado < 0.3 ? 'Derrota honrosa' : rival.conservado < 0.65 ? 'Derrota clara' : 'Derrota aplastante'

  return {
    resultado,
    calificacion,
    segundos,
    lados,
    destacado,
    puntaje,
    desglose: { destruido, supervivencia, rapidez, multiplicador },
  }
}

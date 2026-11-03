// El tablero de la campaña: la ruta de escenarios de cada Orden, con el
// avance guardado en el navegador. Cada escenario sigue el camino relato,
// partida, relato y crónica; al ganar se abre el siguiente.
import { FACCIONES } from '../datos.js'
import { ESCENARIOS, mision } from '../campana/escenarios.js'
import { mostrarPantalla } from './menus.js'

const $ = (s) => document.querySelector(s)
const CLAVE = 'campana'
const ORDENES = ['guardianes', 'inquisidores']

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) ?? {}
  } catch {
    return {}
  }
}

export class Campana {
  constructor({ alJugar, faccionFija }) {
    this.alJugar = alJugar
    this.faccionFija = faccionFija
    this.avance = leer() // facción → cantidad de escenarios ganados
    this.faccion = 'guardianes'
    this.elegido = 0
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-accion]')
      const a = el?.dataset.accion
      if (a === 'campana') this.abrir()
      else if (a === 'campana-faccion') this.cambiarFaccion(el.dataset.faccion)
      else if (a === 'campana-escenario') this.elegir(Number(el.dataset.i))
      else if (a === 'campana-jugar') this.jugar()
      else if (a === 'campana-cronica') this.mostrarCronica(ESCENARIOS[this.elegido], false)
      else if (a === 'cerrar-cronica') this.cerrarCronica()
      else if (a === 'campana-reintentar') this.reintentar()
    })
  }

  ganados(f = this.faccion) {
    return Math.min(this.avance[f] ?? 0, ESCENARIOS.length)
  }

  abrir() {
    const fija = this.faccionFija()
    if (fija && !this.abierta) this.faccion = fija
    this.abierta = true
    this.cambiarFaccion(this.faccion)
    mostrarPantalla('pantalla-campana')
  }

  cambiarFaccion(f) {
    this.faccion = f
    document.documentElement.style.setProperty('--acento', FACCIONES[f].acentoCss)
    this.elegido = Math.min(this.ganados(), ESCENARIOS.length - 1)
    this.dibujar()
  }

  elegir(i) {
    if (i > this.ganados()) return
    this.elegido = i
    this.dibujar()
  }

  dibujar() {
    const ganados = this.ganados()
    $('#campana-ordenes').innerHTML = ORDENES.map(
      (f) => `<button class="btn chico ${f === this.faccion ? 'activo' : ''}" data-accion="campana-faccion" data-faccion="${f}">${FACCIONES[f].nombre} <small>${this.ganados(f)}/${ESCENARIOS.length}</small></button>`,
    ).join('')
    // La ruta: una línea por tramo, encendida hasta donde llegaste.
    const tramos = ESCENARIOS.slice(1)
      .map((e, i) => {
        const a = ESCENARIOS[i]
        return `<line x1="${a.x}" y1="${a.y}" x2="${e.x}" y2="${e.y}" class="${i < ganados ? 'hecho' : ''}" vector-effect="non-scaling-stroke"/>`
      })
      .join('')
    const nodos = ESCENARIOS.map((e, i) => {
      const estado = i < ganados ? 'hecho' : i === ganados ? 'actual' : 'bloqueado'
      return `<button class="nodo ${estado} ${i === this.elegido ? 'elegido' : ''}" style="left:${e.x}%;top:${e.y}%" data-accion="campana-escenario" data-i="${i}" ${estado === 'bloqueado' ? 'disabled' : ''}>
        <b>${e.numero}</b><span>${estado === 'bloqueado' ? '???' : e.titulo}</span></button>`
    }).join('')
    $('#campana-mapa').innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${tramos}</svg>${nodos}`
    const e = ESCENARIOS[this.elegido]
    const d = e[this.faccion]
    const hecho = this.elegido < ganados
    $('#campana-detalle').innerHTML = `
      <div class="fila-titulo">Escenario ${e.numero} · ${e.lugar}</div>
      <h3>${e.titulo}</h3>
      <p>${d.resumen}</p>
      <button class="btn grande" data-accion="campana-jugar">${hecho ? 'Volver a jugar' : 'Comenzar'}</button>
      ${hecho ? '<button class="btn chico" data-accion="campana-cronica">Leer la crónica</button>' : ''}
      ${ganados >= ESCENARIOS.length ? '<p class="nota">Campaña terminada. Falta ver la historia desde la otra Orden.</p>' : ''}`
  }

  jugar() {
    this.actual = this.elegido
    this.alJugar(mision(ESCENARIOS[this.actual], this.faccion), this.faccion)
  }

  reintentar() {
    $('#pantalla-cronica').classList.remove('visible')
    this.jugar()
  }

  // Terminó el relato final de un escenario.
  alTerminar(resultado) {
    const e = ESCENARIOS[this.actual]
    if (resultado === 'victoria') {
      this.avance[this.faccion] = Math.max(this.ganados(), this.actual + 1)
      try {
        localStorage.setItem(CLAVE, JSON.stringify(this.avance))
      } catch {}
      this.abrir()
      this.elegido = Math.min(this.ganados(), ESCENARIOS.length - 1)
      this.dibujar()
      this.mostrarCronica(e, true)
    } else {
      this.abrir()
      $('#cronica-contenido').innerHTML = `<div class="fila-titulo">Escenario ${e.numero}</div><h2 class="encabezado">Derrota</h2><p>${e.titulo} sigue sin resolverse.</p>
        <div class="cronica-botones"><button class="btn grande" data-accion="campana-reintentar">Reintentar</button><button class="btn" data-accion="cerrar-cronica">Al tablero</button></div>`
      $('#pantalla-cronica').classList.add('visible')
    }
  }

  mostrarCronica(e, nueva) {
    $('#cronica-contenido').innerHTML = `<div class="fila-titulo">${nueva ? 'Crónica desbloqueada' : 'Crónica'}</div><h2 class="encabezado">${e.cronica.titulo}</h2><p class="cronica-texto">${e.cronica.texto}</p>
      <div class="cronica-botones"><button class="btn grande" data-accion="cerrar-cronica">Continuar</button></div>`
    $('#pantalla-cronica').classList.add('visible')
  }

  cerrarCronica() {
    $('#pantalla-cronica').classList.remove('visible')
  }
}

// Panel de objetivos y transmisiones durante una misión.
export class PanelMision {
  constructor() {
    this.el = $('#hud-mision')
    this.el.hidden = false
    this.voz = $('#hud-transmision')
    this.voz.hidden = true
  }

  objetivos(lista) {
    const marca = { activo: '◇', cumplido: '◆', fallido: '✕' }
    $('#hud-objetivos').innerHTML = lista
      .map((o) => `<li class="${o.estado}"><i>${marca[o.estado]}</i><span>${o.texto}</span><b>${o.progreso ?? ''}</b></li>`)
      .join('')
  }

  transmision(quien, texto) {
    this.voz.innerHTML = `<b>${quien}</b>${texto}`
    this.voz.hidden = false
    clearTimeout(this.reloj)
    this.reloj = setTimeout(() => (this.voz.hidden = true), 7000)
  }

  destruir() {
    clearTimeout(this.reloj)
    this.el.hidden = true
    this.voz.hidden = true
  }
}

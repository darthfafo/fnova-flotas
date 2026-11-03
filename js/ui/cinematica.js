// Relatos de la campaña: franjas de cine, cámara lenta sobre el escenario
// real y el texto línea por línea, igual que el prólogo.
import * as THREE from 'three'

const $ = (s) => document.querySelector(s)
const PAUSA_TEXTO = 0.5

export class Cinematica {
  // tomas: ver campana/escenarios.js. foco(nombre) devuelve el Vector3 a mirar.
  constructor({ tomas, titulo, orbital, foco, alTerminar }) {
    this.tomas = tomas
    this.orbital = orbital
    this.foco = foco
    this.alTerminar = alTerminar
    this.i = -1
    this.t = 0
    this.dur = 0
    this.capa = $('#cine')
    this.linea = $('#cine-linea')
    this.titulo = $('#cine-titulo')
    this.capa.hidden = false
    void this.capa.offsetWidth // deja que las franjas entren con su transición
    this.capa.classList.add('activa')
    this.linea.classList.remove('visible')
    this.titulo.innerHTML = titulo ?? ''
    this.titulo.classList.toggle('visible', !!titulo)
    this.esperaTitulo = titulo ? 3 : 0
    this.suavidadAntes = orbital.suavidad
    orbital.suavidad = 2
    orbital.seguir = null
    this.alSaltar = () => this.terminar()
    this.alTecla = (e) => {
      if (!['Escape', ' ', 'Enter'].includes(e.key)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      this.terminar()
    }
    $('#cine-saltar').onclick = this.alSaltar
    window.addEventListener('keydown', this.alTecla, true)
    this.encuadrar(tomas[0], true)
  }

  encuadrar(toma, corte) {
    const o = this.orbital
    const p = this.foco(toma.foco)
    if (p) {
      o.seguir = () => this.foco(toma.foco)
      o.focoDeseado.copy(p)
      if (corte) o.foco.copy(p)
    }
    o.distDeseada = toma.dist
    o.yaw = toma.yaw[0]
    o.pitch = toma.pitch
    if (corte) o.dist = toma.dist * 1.15
  }

  siguiente() {
    this.i++
    if (this.i >= this.tomas.length) return this.terminar()
    const toma = this.tomas[this.i]
    this.encuadrar(toma, true)
    this.t = 0
    const letras = toma.texto.replace(/<[^>]+>/g, '').length
    this.dur = 3.2 + letras * 0.045
    this.linea.classList.remove('visible')
    this.linea.innerHTML = toma.texto
    void this.linea.offsetWidth
    this.linea.classList.add('visible')
  }

  actualizar(dt) {
    if (this.fin) return
    if (this.esperaTitulo > 0) {
      this.esperaTitulo -= dt
      if (this.esperaTitulo <= 0) this.titulo.classList.remove('visible')
      return
    }
    if (this.i < 0) return this.siguiente()
    this.t += dt
    const toma = this.tomas[this.i]
    this.orbital.yaw = THREE.MathUtils.lerp(toma.yaw[0], toma.yaw[1], Math.min(1, this.t / (this.dur + PAUSA_TEXTO)))
    if (this.t >= this.dur + PAUSA_TEXTO) this.siguiente()
    else if (this.t >= this.dur) this.linea.classList.remove('visible')
  }

  terminar() {
    if (this.fin) return
    this.fin = true
    window.removeEventListener('keydown', this.alTecla, true)
    this.capa.classList.remove('activa')
    this.capa.hidden = true
    this.linea.classList.remove('visible')
    this.titulo.classList.remove('visible')
    this.orbital.suavidad = this.suavidadAntes
    this.orbital.seguir = null
    this.alTerminar()
  }
}

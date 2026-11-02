// Controles táctiles (celular y tablet). Se suman a los de touchpad y
// teclado (entrada.js), que ignoran los toques.
//   un dedo y arrastrar   → girar la cámara
//   dos dedos             → pellizcar: zoom · arrastrar: desplazar
//   tocar nave propia     → seleccionar su batallón (doble toque: todos los de ese tipo)
//   mantener apretado     → sumar un batallón a la selección
//   tocar enemigo         → atacarlo (con algo seleccionado)
//   tocar espacio vacío   → mover la selección ahí
// En modo "Mover" (botón), tocar elige el destino; ▲ ▼ ajustan la altura.
import * as THREE from 'three'
import { JUGADOR } from './sim/batalla.js'

export const ES_TACTIL = window.matchMedia('(pointer: coarse)').matches

const MOVIMIENTO_MINIMO = 10 // px antes de considerar que el dedo arrastra
const TOQUE_LARGO = 480 // ms

export class Tactil {
  constructor({ elemento, entrada, orbital }) {
    this.el = elemento
    this.entrada = entrada
    this.orbital = orbital
    this.dedos = new Map() // pointerId → { x, y, x0, y0, t0 }
    this.alturaMovimiento = 0
    this.manejadores = {
      pointerdown: (e) => this.abajo(e),
      pointermove: (e) => this.mover(e),
      pointerup: (e) => this.arriba(e),
      pointercancel: (e) => this.cancelar(e),
    }
    for (const [k, f] of Object.entries(this.manejadores)) elemento.addEventListener(k, f)
  }

  destruir() {
    for (const [k, f] of Object.entries(this.manejadores)) this.el.removeEventListener(k, f)
    clearTimeout(this.largo)
  }

  coords(e) {
    const r = this.el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  abajo(e) {
    if (e.pointerType !== 'touch') return
    e.preventDefault()
    window.__ultimoToque = performance.now()
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {}
    const c = this.coords(e)
    this.dedos.set(e.pointerId, { ...c, x0: c.x, y0: c.y, t0: performance.now() })
    clearTimeout(this.largo)
    if (this.dedos.size === 1) {
      this.arrastrando = false
      this.gestoDoble = false
      // Mantener apretado sobre una nave propia: suma su batallón a la selección.
      this.largo = setTimeout(() => {
        const d = this.dedos.get(e.pointerId)
        if (!d || this.arrastrando || this.dedos.size !== 1) return
        const n = this.entrada.naveBajo(d.x, d.y)
        if (n?.equipo === JUGADOR) {
          this.entrada.seleccionar([n.batallon], true)
          this.entrada.alOrden?.('seleccion')
          navigator.vibrate?.(15)
          this.consumido = true
        }
      }, TOQUE_LARGO)
      this.consumido = false
    } else {
      // Segundo dedo: empieza un gesto de cámara, se cancela el toque.
      this.gestoDoble = true
      this.medida = this.medirDos()
    }
  }

  medirDos() {
    const [a, b] = [...this.dedos.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }

  mover(e) {
    if (e.pointerType !== 'touch' || !this.dedos.has(e.pointerId)) return
    e.preventDefault()
    const d = this.dedos.get(e.pointerId)
    const c = this.coords(e)
    const dx = c.x - d.x
    const dy = c.y - d.y
    d.x = c.x
    d.y = c.y
    const o = this.orbital
    if (this.dedos.size === 1 && !this.gestoDoble) {
      if (!this.arrastrando && Math.hypot(d.x - d.x0, d.y - d.y0) > MOVIMIENTO_MINIMO) {
        this.arrastrando = true
        clearTimeout(this.largo)
      }
      if (this.arrastrando) {
        // Un dedo: girar alrededor del foco.
        o.yaw -= dx * 0.006
        o.pitch = THREE.MathUtils.clamp(o.pitch + dy * 0.005, -1.45, 1.45)
      }
    } else if (this.dedos.size === 2) {
      const m = this.medirDos()
      // Pellizco: zoom. Arrastre de los dos dedos: desplazar el foco.
      if (this.medida.dist > 0) o.zoom(this.medida.dist / Math.max(1, m.dist))
      const escala = o.dist / 500
      const adelante = new THREE.Vector3(-Math.sin(o.yaw), 0, -Math.cos(o.yaw))
      const derecha = new THREE.Vector3(-adelante.z, 0, adelante.x)
      o.focoDeseado.addScaledVector(derecha, -(m.cx - this.medida.cx) * escala).addScaledVector(adelante, (m.cy - this.medida.cy) * escala)
      o.seguir = null
      this.medida = m
    }
  }

  arriba(e) {
    if (e.pointerType !== 'touch' || !this.dedos.has(e.pointerId)) return
    e.preventDefault()
    const d = this.dedos.get(e.pointerId)
    this.dedos.delete(e.pointerId)
    clearTimeout(this.largo)
    if (this.dedos.size === 0 && !this.gestoDoble && !this.arrastrando && !this.consumido && performance.now() - d.t0 < 700)
      this.toque(d.x, d.y)
    if (this.dedos.size === 0) this.gestoDoble = false
    else this.medida = this.medirDos()
  }

  cancelar(e) {
    this.dedos.delete(e.pointerId)
    clearTimeout(this.largo)
  }

  toque(x, y) {
    const en = this.entrada
    const b = en.batalla
    const sel = en.seleccionados
    const n = en.naveBajo(x, y)

    if (en.modo === 'mover' && en.movimiento) {
      const p = en.puntoEnPlano(x, y, en.movimiento.centro.y)
      en.movimiento.punto.set(p.x, en.movimiento.centro.y + this.alturaMovimiento, p.z)
      en.confirmarMovimiento()
      this.alturaMovimiento = 0
      return
    }
    if (en.modo === 'atacar') {
      if (n && n.equipo !== JUGADOR) {
        b.ordenarAtacar(sel, n.batallon)
        en.marca = { pos: n.pos.clone(), t: 0.6, color: '#ff5a4a' }
        en.cancelarModo()
        en.alOrden?.('atacar')
      }
      return
    }
    if (n?.equipo === JUGADOR) {
      const ahora = performance.now()
      if (ahora - en.ultimoClic.t < 380 && en.ultimoClic.b === n.batallon)
        en.seleccionar(b.batallones.filter((x) => x.equipo === JUGADOR && x.tipo === n.batallon.tipo))
      else en.seleccionar([n.batallon])
      en.ultimoClic = { t: ahora, b: n.batallon }
      en.alOrden?.('seleccion')
      return
    }
    if (!sel.length) return
    if (n) {
      b.ordenarAtacar(sel, n.batallon)
      en.marca = { pos: n.pos.clone(), t: 0.6, color: '#ff5a4a' }
      en.alOrden?.('atacar')
    } else {
      const c = en.centroSeleccion()
      const p = en.puntoEnPlano(x, y, c.y)
      b.ordenarMover(sel, p)
      en.marca = { pos: p, t: 0.6, color: '#6fe0a0' }
      en.alOrden?.('mover')
    }
  }

  // Botones ▲ ▼ del modo mover.
  cambiarAltura(delta) {
    const en = this.entrada
    if (!en.movimiento) return
    this.alturaMovimiento += delta * Math.max(20, this.orbital.dist / 8)
    en.movimiento.altura = en.movimiento.centro.y + this.alturaMovimiento
    en.movimiento.punto.y = en.movimiento.altura
    en.alAviso(`Mover · tocá el destino · altura ${this.alturaMovimiento > 0 ? '+' : ''}${Math.round(this.alturaMovimiento)}`)
  }
}

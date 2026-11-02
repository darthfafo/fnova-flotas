// Minimapa táctico visto desde arriba (x a la derecha, z hacia abajo: tu
// flota empieza abajo). Clic o arrastre: mueve la cámara. Clic con dos
// dedos: manda la selección a ese punto.
import * as THREE from 'three'
import { JUGADOR } from '../sim/batalla.js'

const VERDE = '#6fe0a0'
const ROJO = '#ff5a4a'

export class Minimapa {
  constructor({ lienzo, batalla, entrada, orbital }) {
    this.lienzo = lienzo
    this.g = lienzo.getContext('2d')
    this.batalla = batalla
    this.entrada = entrada
    this.orbital = orbital
    this.reloj = 0
    this.alcance = 1600
    this.redimensionar()

    const aMundo = (e) => {
      const r = lienzo.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2 * this.alcance
      const z = ((e.clientY - r.top) / r.height - 0.5) * 2 * this.alcance
      return { x, z }
    }
    let arrastrando = false
    this.manejadores = {
      pointerdown: (e) => {
        if (e.button !== 0) return
        arrastrando = true
        try {
          lienzo.setPointerCapture(e.pointerId)
        } catch {}
        this.enfocar(aMundo(e))
      },
      pointermove: (e) => arrastrando && this.enfocar(aMundo(e)),
      pointerup: () => (arrastrando = false),
      contextmenu: (e) => {
        e.preventDefault()
        const sel = this.entrada.seleccionados
        if (!sel.length) return
        const c = this.entrada.centroSeleccion()
        const p = aMundo(e)
        const punto = new THREE.Vector3(p.x, c.y, p.z)
        this.batalla.ordenarMover(sel, punto)
        this.entrada.marca = { pos: punto, t: 0.6, color: VERDE }
        this.entrada.alOrden?.('mover')
      },
    }
    for (const [k, f] of Object.entries(this.manejadores)) lienzo.addEventListener(k, f)
  }

  destruir() {
    for (const [k, f] of Object.entries(this.manejadores)) this.lienzo.removeEventListener(k, f)
  }

  redimensionar() {
    const r = window.devicePixelRatio || 1
    const w = this.lienzo.clientWidth || 200
    this.lienzo.width = w * r
    this.lienzo.height = w * r
    this.lado = w
    this.g.setTransform(r, 0, 0, r, 0, 0)
  }

  enfocar({ x, z }) {
    this.orbital.seguir = null
    this.orbital.focoDeseado.x = x
    this.orbital.focoDeseado.z = z
  }

  aPantalla(x, z) {
    const L = this.lado
    return [(x / this.alcance / 2 + 0.5) * L, (z / this.alcance / 2 + 0.5) * L]
  }

  dibujar(dt) {
    this.reloj -= dt
    if (this.reloj > 0) return
    this.reloj = 0.1
    if (this.lienzo.clientWidth !== this.lado) this.redimensionar()
    const g = this.g
    const L = this.lado
    const b = this.batalla
    // El alcance se ajusta para que entren todas las naves y el terreno.
    let max = 1200
    for (const n of b.naves) if (n.viva) max = Math.max(max, Math.abs(n.pos.x), Math.abs(n.pos.z))
    for (const a of b.terreno.asteroides) max = Math.max(max, Math.abs(a.pos.x) + a.radio, Math.abs(a.pos.z) + a.radio)
    this.alcance += (max * 1.1 - this.alcance) * 0.1

    g.clearRect(0, 0, L, L)
    g.fillStyle = 'rgba(4, 8, 14, 0.6)'
    g.fillRect(0, 0, L, L)
    // Grilla.
    g.strokeStyle = 'rgba(150, 195, 230, 0.08)'
    g.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      g.beginPath()
      g.moveTo((L * i) / 4, 0)
      g.lineTo((L * i) / 4, L)
      g.moveTo(0, (L * i) / 4)
      g.lineTo(L, (L * i) / 4)
      g.stroke()
    }
    const escala = L / (this.alcance * 2)
    for (const n of b.terreno.nebulosas) {
      const [x, y] = this.aPantalla(n.pos.x, n.pos.z)
      const gr = g.createRadialGradient(x, y, 0, x, y, n.radio * escala)
      const c = new THREE.Color(n.color)
      gr.addColorStop(0, `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.45)`)
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.beginPath()
      g.arc(x, y, n.radio * escala, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = 'rgba(160, 145, 125, 0.7)'
    for (const a of b.terreno.asteroides) {
      const [x, y] = this.aPantalla(a.pos.x, a.pos.z)
      g.beginPath()
      g.arc(x, y, Math.max(1.2, a.radio * escala), 0, Math.PI * 2)
      g.fill()
    }
    const sel = this.entrada.seleccion
    for (const n of b.naves) {
      if (!n.viva) continue
      if (n.equipo !== JUGADOR && !b.esVisible(JUGADOR, n)) continue
      const [x, y] = this.aPantalla(n.pos.x, n.pos.z)
      g.fillStyle = n.equipo === JUGADOR ? (sel.has(n.batallon) ? '#ffffff' : VERDE) : ROJO
      const t = n.esCapital ? 3.5 : 1.6
      g.fillRect(x - t / 2, y - t / 2, t, t)
    }
    // Cámara: foco y hacia dónde mira.
    const o = this.orbital
    const [cx, cy] = this.aPantalla(o.foco.x, o.foco.z)
    const ancho = THREE.MathUtils.clamp(o.dist * escala * 0.9, 10, 36)
    const dx = -Math.sin(o.yaw)
    const dz = -Math.cos(o.yaw)
    g.strokeStyle = 'rgba(255, 182, 72, 0.85)'
    g.lineWidth = 1.2
    // Cuña: el vértice es la cámara (detrás del foco) y se abre hacia adelante.
    const ax = cx - dx * ancho * 0.7
    const ay = cy - dz * ancho * 0.7
    g.beginPath()
    g.moveTo(cx - dz * ancho * 0.5, cy + dx * ancho * 0.5)
    g.lineTo(ax, ay)
    g.lineTo(cx + dz * ancho * 0.5, cy - dx * ancho * 0.5)
    g.stroke()
    g.beginPath()
    g.arc(cx, cy, 3, 0, Math.PI * 2)
    g.stroke()
  }
}

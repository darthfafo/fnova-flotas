// Selección y órdenes. Todo se puede hacer con touchpad + teclado:
//   clic: seleccionar · arrastrar: recuadro · clic con dos dedos: orden
//   M: mover en 3D con el disco de Homeworld (Shift = altura)
//   A: atacar · S: detener · F: enfocar · Z X C V: formación · T: táctica
import * as THREE from 'three'
import { JUGADOR } from './sim/batalla.js'
import { TACTICAS } from './datos.js'

const ORDEN_TACTICAS = Object.keys(TACTICAS)
const _v = new THREE.Vector3()

export class Entrada {
  constructor({ elemento, camara, orbital, batalla, alCambiarSeleccion, alAviso, alPausa, alSensores, alPausaTactica, alVelocidad, alOrden }) {
    this.el = elemento
    this.camara = camara
    this.orbital = orbital
    this.batalla = batalla
    this.seleccion = new Set()
    this.grupos = {}
    this.modo = 'normal' // 'normal' | 'mover' | 'atacar'
    this.cursor = { x: 0, y: 0 }
    this.arrastre = null
    this.movimiento = null // { centro, punto, altura, ajustandoAltura, yBase }
    this.alCambiarSeleccion = alCambiarSeleccion
    this.alAviso = alAviso
    this.alPausa = alPausa
    this.alSensores = alSensores
    this.alPausaTactica = alPausaTactica
    this.alVelocidad = alVelocidad
    this.alOrden = alOrden
    this.ultimoClic = { t: 0, b: null }
    this.activa = true

    this.manejadores = {
      pointerdown: (e) => this.alApretar(conCoordenadas(e, elemento)),
      pointermove: (e) => this.alMover(conCoordenadas(e, elemento)),
      pointerup: (e) => this.alSoltar(conCoordenadas(e, elemento)),
      contextmenu: (e) => this.alClicSecundario(conCoordenadas(e, elemento)),
    }
    for (const [k, f] of Object.entries(this.manejadores)) elemento.addEventListener(k, f)
    this.teclaAbajo = (e) => this.alTecla(e)
    this.teclaArriba = (e) => {
      this.orbital.teclas.delete(normalizar(e.key))
      if (e.key === 'Shift' && this.movimiento) this.movimiento.ajustandoAltura = false
    }
    window.addEventListener('keydown', this.teclaAbajo)
    window.addEventListener('keyup', this.teclaArriba)
  }

  destruir() {
    for (const [k, f] of Object.entries(this.manejadores)) this.el.removeEventListener(k, f)
    window.removeEventListener('keydown', this.teclaAbajo)
    window.removeEventListener('keyup', this.teclaArriba)
  }

  get seleccionados() {
    return [...this.seleccion].filter((b) => b.viva)
  }

  // --- Proyección y picking ----------------------------------------------

  aPantalla(p, destino = { x: 0, y: 0, z: 0 }) {
    _v.copy(p).project(this.camara)
    destino.x = (_v.x * 0.5 + 0.5) * this.el.clientWidth
    destino.y = (-_v.y * 0.5 + 0.5) * this.el.clientHeight
    destino.z = _v.z
    return destino
  }

  radioEnPantalla(nave) {
    const d = nave.pos.distanceTo(this.camara.position)
    const f = this.el.clientHeight / 2 / Math.tan(THREE.MathUtils.degToRad(this.camara.fov / 2))
    return (nave.radio / d) * f
  }

  naveBajo(x, y) {
    let mejor = null
    let dMejor = Infinity
    const s = {}
    for (const n of this.batalla.naves) {
      if (!n.viva || !this.batalla.esVisible(JUGADOR, n)) continue
      this.aPantalla(n.pos, s)
      if (s.z > 1) continue
      const r = Math.max(14, this.radioEnPantalla(n) * 0.9)
      const d = Math.hypot(s.x - x, s.y - y)
      if (d < r && d < dMejor) {
        dMejor = d
        mejor = n
      }
    }
    return mejor
  }

  rayo(x, y) {
    const r = new THREE.Raycaster()
    r.setFromCamera(new THREE.Vector2((x / this.el.clientWidth) * 2 - 1, -(y / this.el.clientHeight) * 2 + 1), this.camara)
    return r.ray
  }

  // Punto en el plano horizontal a la altura dada; si el rayo no lo corta
  // (cámara casi rasante), un punto a la distancia del foco.
  puntoEnPlano(x, y, altura) {
    const ray = this.rayo(x, y)
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -altura)
    const p = new THREE.Vector3()
    if (ray.intersectPlane(plano, p) && p.distanceTo(this.camara.position) < this.orbital.dist * 6) return p
    return ray.at(this.orbital.dist, p)
  }

  centroSeleccion() {
    const sel = this.seleccionados
    const c = new THREE.Vector3()
    for (const b of sel) c.add(b.centro(_v))
    return sel.length ? c.divideScalar(sel.length) : null
  }

  // --- Selección ----------------------------------------------------------

  seleccionar(lista, sumar = false) {
    if (!sumar) this.seleccion.clear()
    for (const b of lista) if (b.equipo === JUGADOR && b.viva) this.seleccion.add(b)
    this.alCambiarSeleccion()
  }

  limpiarMuertos() {
    let cambio = false
    for (const b of this.seleccion)
      if (!b.viva) {
        this.seleccion.delete(b)
        cambio = true
      }
    if (cambio) this.alCambiarSeleccion()
  }

  // --- Puntero ------------------------------------------------------------

  alApretar(e) {
    if (!this.activa || e.button !== 0) return
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {}
    this.arrastre = { x0: e.offsetX, y0: e.offsetY, x: e.offsetX, y: e.offsetY, activo: false, shift: e.shiftKey }
  }

  alMover(e) {
    this.cursor.x = e.offsetX
    this.cursor.y = e.offsetY
    if (this.movimiento) this.actualizarMovimiento(e)
    const a = this.arrastre
    if (!a) return
    a.x = e.offsetX
    a.y = e.offsetY
    if (!a.activo && Math.hypot(a.x - a.x0, a.y - a.y0) > 6 && this.modo === 'normal') a.activo = true
  }

  alSoltar(e) {
    if (e.button !== 0) return
    const a = this.arrastre
    this.arrastre = null
    if (!this.activa || !a) return
    if (this.modo === 'mover') return this.confirmarMovimiento()
    if (this.modo === 'atacar') {
      const n = this.naveBajo(e.offsetX, e.offsetY)
      if (n && n.equipo !== JUGADOR) {
        this.batalla.ordenarAtacar(this.seleccionados, n.batallon)
        this.alAviso(null)
        this.modo = 'normal'
        this.alOrden?.('atacar')
      }
      return
    }
    if (a.activo) {
      const x0 = Math.min(a.x0, a.x)
      const x1 = Math.max(a.x0, a.x)
      const y0 = Math.min(a.y0, a.y)
      const y1 = Math.max(a.y0, a.y)
      const s = {}
      const dentro = new Set()
      for (const n of this.batalla.naves) {
        if (!n.viva || n.equipo !== JUGADOR) continue
        this.aPantalla(n.pos, s)
        if (s.z < 1 && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) dentro.add(n.batallon)
      }
      this.seleccionar(dentro, a.shift)
      this.alOrden?.('seleccion')
      return
    }
    const n = this.naveBajo(e.offsetX, e.offsetY)
    const ahora = performance.now()
    if (n && n.equipo === JUGADOR) {
      if (ahora - this.ultimoClic.t < 350 && this.ultimoClic.b === n.batallon) {
        // Doble clic: todos los batallones del mismo tipo.
        this.seleccionar(this.batalla.batallones.filter((b) => b.equipo === JUGADOR && b.tipo === n.batallon.tipo))
      } else if (a.shift && this.seleccion.has(n.batallon)) {
        this.seleccion.delete(n.batallon)
        this.alCambiarSeleccion()
      } else this.seleccionar([n.batallon], a.shift)
      this.ultimoClic = { t: ahora, b: n.batallon }
      this.alOrden?.('seleccion')
    } else if (!a.shift) this.seleccionar([])
  }

  alClicSecundario(e) {
    e.preventDefault()
    if (!this.activa) return
    if (this.modo !== 'normal') return this.cancelarModo()
    const sel = this.seleccionados
    if (!sel.length) return
    const n = this.naveBajo(e.offsetX, e.offsetY)
    if (n && n.equipo !== JUGADOR) {
      this.batalla.ordenarAtacar(sel, n.batallon)
      this.marca = { pos: n.pos.clone(), t: 0.6, color: '#ff5a4a' }
      this.alOrden?.('atacar')
    } else {
      const c = this.centroSeleccion()
      const p = this.puntoEnPlano(e.offsetX, e.offsetY, c.y)
      this.batalla.ordenarMover(sel, p)
      this.marca = { pos: p, t: 0.6, color: '#6fe0a0' }
      this.alOrden?.('mover')
    }
  }

  // --- Modo mover (disco de Homeworld) ------------------------------------

  iniciarMovimiento() {
    const c = this.centroSeleccion()
    if (!c) return
    this.modo = 'mover'
    this.movimiento = { centro: c, punto: c.clone(), altura: c.y, ajustandoAltura: false, yBase: 0 }
    this.alAviso('Mover · clic para confirmar · Shift para cambiar la altura · Esc cancela')
    this.actualizarMovimiento({ offsetX: this.cursor.x, offsetY: this.cursor.y, shiftKey: false })
  }

  actualizarMovimiento(e) {
    const m = this.movimiento
    if (!m) return
    if (e.shiftKey || m.ajustandoAltura) {
      if (!m.ajustandoAltura) {
        m.ajustandoAltura = true
        m.yBase = e.offsetY
        m.alturaBase = m.altura
      }
      m.altura = m.alturaBase + (m.yBase - e.offsetY) * (this.orbital.dist / 400)
      m.punto.y = m.altura
    } else {
      const p = this.puntoEnPlano(e.offsetX, e.offsetY, m.centro.y)
      m.punto.set(p.x, m.altura, p.z)
    }
  }

  confirmarMovimiento() {
    const m = this.movimiento
    this.batalla.ordenarMover(this.seleccionados, m.punto.clone())
    this.marca = { pos: m.punto.clone(), t: 0.6, color: '#6fe0a0' }
    this.cancelarModo()
    this.alOrden?.('mover3d')
    this.alOrden?.('mover')
  }

  cancelarModo() {
    this.modo = 'normal'
    this.movimiento = null
    this.alAviso(null)
  }

  // --- Teclado ------------------------------------------------------------

  alTecla(e) {
    if (!this.activa) return
    const k = normalizar(e.key)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'q', 'e', '+', '=', '-'].includes(k)) {
      this.orbital.teclas.add(k)
      e.preventDefault()
      return
    }
    if (e.key === 'Shift' && this.movimiento) {
      this.actualizarMovimiento({ offsetX: this.cursor.x, offsetY: this.cursor.y, shiftKey: true })
      return
    }
    const sel = this.seleccionados
    if (e.ctrlKey || e.metaKey) {
      if (/^[1-9]$/.test(k) && e.ctrlKey) {
        this.grupos[k] = [...sel]
        this.alAviso(`Grupo ${k} guardado`, 1.2)
        e.preventDefault()
      } else if (k === 'a') {
        this.seleccionar(this.batalla.batallones.filter((b) => b.equipo === JUGADOR))
        e.preventDefault()
      }
      return
    }
    if (/^[1-9]$/.test(k)) {
      if (this.grupos[k]) this.seleccionar(this.grupos[k])
      return
    }
    switch (k) {
      case 'Escape':
        if (this.modo !== 'normal') this.cancelarModo()
        else this.alPausa()
        break
      case ' ':
        e.preventDefault()
        this.alSensores()
        break
      case 'p':
        this.alPausaTactica?.()
        break
      case 'r':
        this.alVelocidad?.()
        break
      case 'Tab': {
        e.preventDefault()
        const propios = this.batalla.batallones.filter((b) => b.equipo === JUGADOR && b.viva)
        if (!propios.length) break
        const actual = sel.length === 1 ? propios.indexOf(sel[0]) : -1
        this.seleccionar([propios[(actual + 1) % propios.length]])
        this.enfocar(false)
        break
      }
      case 'm':
        if (sel.length) this.iniciarMovimiento()
        break
      case 'a':
        if (sel.length) {
          this.modo = 'atacar'
          this.movimiento = null
          this.alAviso('Atacar · clic en un enemigo · Esc cancela')
        }
        break
      case 's':
        this.batalla.ordenarDetener(sel)
        break
      case 'f':
        this.enfocar(true)
        break
      case 'z':
        this.comando({ formacion: 'delta' })
        break
      case 'x':
        this.comando({ formacion: 'muro' })
        break
      case 'c':
        this.comando({ formacion: 'esfera' })
        break
      case 'v':
        this.comando({ formacion: 'garra' })
        break
      case 't': {
        if (!sel.length) break
        const i = ORDEN_TACTICAS.indexOf(sel[0].tactica)
        this.comando({ tactica: ORDEN_TACTICAS[(i + 1) % ORDEN_TACTICAS.length] })
        break
      }
    }
  }

  // Comandos compartidos con los botones del HUD.
  comando({ cmd, formacion, tactica }) {
    const sel = this.seleccionados
    if (cmd === 'mover' && sel.length) this.iniciarMovimiento()
    if (cmd === 'atacar' && sel.length) {
      this.modo = 'atacar'
      this.alAviso('Atacar · clic en un enemigo · Esc cancela')
    }
    if (cmd === 'detener') this.batalla.ordenarDetener(sel)
    if (cmd === 'enfocar') this.enfocar(true)
    if (formacion && sel.length) {
      this.batalla.cambiarFormacion(sel, formacion)
      this.alAviso(`Formación ${formacion}`, 1)
    }
    if (tactica && sel.length) {
      this.batalla.cambiarTactica(sel, tactica)
      this.alAviso(`Táctica ${TACTICAS[tactica].nombre}`, 1)
    }
    this.alCambiarSeleccion()
  }

  enfocar(seguir) {
    const c = this.centroSeleccion()
    if (!c) return
    const sel = this.seleccionados
    const tam = Math.max(...sel.map((b) => b.tipo.largo)) * (sel.length > 1 ? 10 : 6)
    this.orbital.enfocar(c, Math.max(120, Math.min(tam, 2500)))
    if (seguir) this.orbital.seguir = () => this.centroSeleccion()
  }
}

// Coordenadas relativas al canvas a partir de clientX/Y (offsetX no es
// confiable con zoom del navegador ni con eventos sintéticos).
function conCoordenadas(e, el) {
  const r = el.getBoundingClientRect()
  return {
    original: e,
    button: e.button,
    pointerId: e.pointerId,
    shiftKey: e.shiftKey,
    offsetX: e.clientX - r.left,
    offsetY: e.clientY - r.top,
    preventDefault: () => e.preventDefault(),
  }
}

function normalizar(k) {
  return k.length === 1 ? k.toLowerCase() : k
}

// HUD de batalla: paneles HTML (flota, selección, comandos, registro) y la
// capa 2D encima del 3D (corchetes de selección, barras de vida, íconos
// tácticos de lejos, recuadro de selección y el disco de movimiento).
import * as THREE from 'three'
import { FACCIONES, FORMACIONES, TACTICAS, TIPOS } from '../datos.js'
import { JUGADOR, ENEMIGO } from '../sim/batalla.js'

const $ = (s) => document.querySelector(s)
const COLOR_PROPIO = '#6fe0a0'
const COLOR_ENEMIGO = '#ff5a4a'
const _p = new THREE.Vector3()

export class Hud {
  constructor({ batalla, entrada, faccion }) {
    this.batalla = batalla
    this.entrada = entrada
    this.lienzo = $('#superposicion')
    this.g = this.lienzo.getContext('2d')
    this.sensores = false
    this.relojDom = 0
    this.avisoT = 0
    this.redimensionar()
    this.alRedimensionar = () => this.redimensionar()
    window.addEventListener('resize', this.alRedimensionar)

    const f = FACCIONES[faccion]
    $('#hud-faccion').textContent = f.nombre
    document.documentElement.style.setProperty('--acento', f.acentoCss)
    $('#hud-registro').innerHTML = ''
    $('#hud').hidden = false
    this.armarFlota()
    this.refrescarSeleccion()
  }

  destruir() {
    window.removeEventListener('resize', this.alRedimensionar)
    $('#hud').hidden = true
    this.g.clearRect(0, 0, this.lienzo.width, this.lienzo.height)
  }

  redimensionar() {
    const r = window.devicePixelRatio || 1
    this.lienzo.width = innerWidth * r
    this.lienzo.height = innerHeight * r
    this.g.setTransform(r, 0, 0, r, 0, 0)
  }

  // --- Paneles HTML -------------------------------------------------------

  armarFlota() {
    const el = $('#hud-flota')
    el.innerHTML = '<div class="titulo-lista">Tu flota</div>'
    for (const b of this.batalla.batallones) {
      if (b.equipo !== JUGADOR) continue
      const d = document.createElement('div')
      d.className = 'item-flota'
      d.innerHTML = `<div class="nombre"><span>${b.nombre}</span><small></small></div>
        <div class="barras"><div class="es"><i></i></div><div class="et"><i></i></div></div>`
      d.onclick = (e) => this.entrada.seleccionar([b], e.shiftKey)
      d.ondblclick = () => {
        this.entrada.seleccionar([b])
        this.entrada.enfocar(true)
      }
      b.itemHud = d
      el.appendChild(d)
    }
  }

  refrescarSeleccion() {
    const sel = this.entrada.seleccionados
    const el = $('#hud-seleccion')
    for (const b of this.batalla.batallones) b.itemHud?.classList.toggle('sel', this.entrada.seleccion.has(b))
    if (!sel.length) {
      el.innerHTML = '<div class="vacia">Sin selección</div><div class="detalle">Tocá un batallón o arrastrá un recuadro. Esc muestra los controles.</div>'
    } else if (sel.length === 1) {
      const b = sel[0]
      const t = b.tipo
      const ventajas = t.ventajaGeneral
        ? `+${Math.round((t.ventajaGeneral - 1) * 100)}% contra todo`
        : Object.keys(t.ventaja ?? {}).map((k) => TIPOS[k].nombre).join(', ')
      el.innerHTML = `<h4>${b.nombre}</h4>
        <div class="detalle">${t.rol}</div>
        <div class="stats">
          <span class="at">Ataque <b>${t.ataque}</b></span>
          <span class="es">Escudo <b>${t.escudo}</b></span>
          <span class="et">Estructura <b>${t.estructura}</b></span>
        </div>
        <div class="detalle" style="margin-top:6px">Ventaja contra: <b style="color:var(--ambar)">${ventajas}</b></div>
        <div class="chips"><span class="chip">Naves <b id="sel-naves"></b></span>
          <span class="chip">${FORMACIONES[b.formacion].nombre}</span><span class="chip">${TACTICAS[b.tactica].nombre}</span>
          <span class="chip" id="sel-orden"></span></div>
        <div class="barras" style="margin-top:8px"><div class="es"><i id="sel-es"></i></div><div class="et"><i id="sel-et"></i></div></div>`
    } else {
      const cuenta = {}
      for (const b of sel) cuenta[b.tipo.nombre] = (cuenta[b.tipo.nombre] ?? 0) + 1
      el.innerHTML = `<h4>${sel.length} batallones</h4>
        <div class="chips">${Object.entries(cuenta).map(([n, c]) => `<span class="chip">${c} × ${n}</span>`).join('')}</div>
        <div class="detalle" style="margin-top:8px">Al moverse juntos, todos van a la velocidad del más lento.</div>
        <div class="barras" style="margin-top:8px"><div class="es"><i id="sel-es"></i></div><div class="et"><i id="sel-et"></i></div></div>`
    }
    // Botones activos según la selección.
    const f = sel[0]?.formacion
    const t = sel[0]?.tactica
    for (const b of document.querySelectorAll('[data-formacion]')) b.classList.toggle('activo', b.dataset.formacion === f)
    for (const b of document.querySelectorAll('[data-tactica]')) b.classList.toggle('activo', b.dataset.tactica === t)
    for (const b of document.querySelectorAll('#hud-comandos .btn')) b.disabled = !sel.length
    this.actualizarDom()
  }

  aviso(texto, segundos) {
    const el = $('#hud-modo')
    el.hidden = !texto
    if (texto) el.textContent = texto
    this.avisoT = segundos ?? 0
  }

  registrar(texto, clase = '') {
    const ul = $('#hud-registro')
    const li = document.createElement('li')
    li.className = clase
    li.textContent = texto
    ul.appendChild(li)
    while (ul.children.length > 6) ul.firstChild.remove()
    setTimeout(() => li.remove(), 9000)
  }

  actualizarDom() {
    const sel = this.entrada.seleccionados
    for (const b of this.batalla.batallones) {
      if (!b.itemHud) continue
      const s = b.salud()
      const i = b.itemHud.querySelectorAll('i')
      i[0].style.width = `${s.escudo * 100}%`
      i[1].style.width = `${s.estructura * 100}%`
      b.itemHud.querySelector('small').textContent = b.viva ? `${b.vivas.length}/${b.naves.length}` : 'perdido'
      b.itemHud.classList.toggle('muerto', !b.viva)
    }
    if (sel.length) {
      let es = 0, et = 0
      for (const b of sel) {
        const s = b.salud()
        es += s.escudo
        et += s.estructura
      }
      const ies = $('#sel-es')
      if (ies) {
        ies.style.width = `${(es / sel.length) * 100}%`
        $('#sel-et').style.width = `${(et / sel.length) * 100}%`
      }
      const n = $('#sel-naves')
      if (n) n.textContent = `${sel[0].vivas.length}/${sel[0].naves.length}`
      const o = $('#sel-orden')
      if (o) {
        const ord = sel[0].orden
        o.textContent = ord.tipo === 'atacar' ? `Atacando: ${ord.objetivo.nombre}` : ord.tipo === 'mover' ? 'En movimiento' : 'En posición'
      }
    }
    // Balance de fuerzas (valor de lo que queda en pie).
    let propia = 0, enemiga = 0
    for (const n of this.batalla.naves) {
      if (!n.viva) continue
      const v = (n.tipo.costo / n.tipo.porBatallon) * (n.estructura / n.tipo.estructuraMax)
      if (n.equipo === JUGADOR) propia += v
      else enemiga += v
    }
    $('#hud-propia').textContent = Math.round(propia)
    $('#hud-enemiga').textContent = Math.round(enemiga)
    $('#hud-balance').style.width = `${(propia / Math.max(1, propia + enemiga)) * 100}%`
    const t = this.batalla.tiempo
    $('#hud-reloj').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
  }

  // --- Capa 2D ------------------------------------------------------------

  dibujar(dt) {
    this.relojDom -= dt
    if (this.relojDom <= 0) {
      this.relojDom = 0.25
      this.actualizarDom()
    }
    if (this.avisoT > 0) {
      this.avisoT -= dt
      if (this.avisoT <= 0) this.aviso(null)
    }

    const g = this.g
    const e = this.entrada
    g.clearRect(0, 0, innerWidth, innerHeight)
    const s = {}

    // Íconos tácticos para naves que de lejos se ven como un punto, y
    // corchetes + barras para las seleccionadas.
    for (const n of this.batalla.naves) {
      if (!n.viva) continue
      e.aPantalla(n.pos, s)
      if (s.z > 1 || s.x < -50 || s.y < -50 || s.x > innerWidth + 50 || s.y > innerHeight + 50) continue
      const r = e.radioEnPantalla(n)
      const propio = n.equipo === JUGADOR
      const color = propio ? COLOR_PROPIO : COLOR_ENEMIGO
      const seleccionada = e.seleccion.has(n.batallon)
      if (r < 6 || this.sensores) {
        const t = n.esCapital ? 7 : 4
        g.strokeStyle = color
        g.fillStyle = color
        g.globalAlpha = seleccionada ? 1 : 0.8
        g.lineWidth = 1.2
        g.beginPath()
        if (n.esCapital) {
          g.moveTo(s.x, s.y - t); g.lineTo(s.x + t, s.y); g.lineTo(s.x, s.y + t); g.lineTo(s.x - t, s.y); g.closePath()
          g.stroke()
        } else {
          g.moveTo(s.x, s.y - t); g.lineTo(s.x + t, s.y + t); g.lineTo(s.x - t, s.y + t); g.closePath()
          seleccionada ? g.fill() : g.stroke()
        }
        g.globalAlpha = 1
      }
      if (seleccionada) this.corchetes(s.x, s.y, Math.max(r * 1.1, 10), COLOR_PROPIO, n)
      else if (!propio && e.modo === 'atacar') this.corchetes(s.x, s.y, Math.max(r * 1.1, 10), COLOR_ENEMIGO, null)
    }

    // Blancos de los seleccionados: corchetes rojos + línea de orden.
    for (const b of e.seleccionados) {
      const c = b.centro(_p)
      const a = e.aPantalla(c, {})
      if (b.orden.tipo === 'atacar' && b.orden.objetivo.viva) {
        const o = e.aPantalla(b.orden.objetivo.centro(_p), {})
        this.linea(a, o, 'rgba(255,90,74,0.45)')
        for (const n of b.orden.objetivo.naves) {
          if (!n.viva) continue
          const sp = e.aPantalla(n.pos, {})
          if (sp.z < 1) this.corchetes(sp.x, sp.y, Math.max(e.radioEnPantalla(n) * 1.1, 9), COLOR_ENEMIGO, n)
        }
      } else if (b.orden.tipo === 'mover') {
        const d = e.aPantalla(b.destino, {})
        this.linea(a, d, 'rgba(111,224,160,0.4)')
        g.strokeStyle = 'rgba(111,224,160,0.7)'
        g.beginPath()
        g.arc(d.x, d.y, 4, 0, Math.PI * 2)
        g.stroke()
      }
    }

    // Recuadro de selección.
    const a = e.arrastre
    if (a?.activo) {
      g.strokeStyle = 'rgba(170,215,255,0.9)'
      g.fillStyle = 'rgba(120,180,255,0.08)'
      g.lineWidth = 1
      g.fillRect(a.x0, a.y0, a.x - a.x0, a.y - a.y0)
      g.strokeRect(a.x0 + 0.5, a.y0 + 0.5, a.x - a.x0, a.y - a.y0)
    }

    if (e.movimiento) this.discoMovimiento(e.movimiento)

    if (e.marca) {
      e.marca.t -= dt
      const m = e.aPantalla(e.marca.pos, {})
      g.strokeStyle = e.marca.color
      g.globalAlpha = Math.max(0, e.marca.t / 0.6)
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(m.x, m.y, 6 + (0.6 - e.marca.t) * 40, 0, Math.PI * 2)
      g.stroke()
      g.globalAlpha = 1
      if (e.marca.t <= 0) e.marca = null
    }
  }

  linea(a, b, color) {
    if (a.z > 1 || b.z > 1) return
    const g = this.g
    g.strokeStyle = color
    g.lineWidth = 1
    g.setLineDash([4, 5])
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
    g.setLineDash([])
  }

  // Corchetes en las esquinas (como Homeworld) y, si hay nave, sus barras.
  corchetes(x, y, r, color, nave) {
    const g = this.g
    const l = Math.max(4, r * 0.35)
    g.strokeStyle = color
    g.lineWidth = 1.2
    g.beginPath()
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * r
      const cy = y + sy * r
      g.moveTo(cx, cy - sy * l)
      g.lineTo(cx, cy)
      g.lineTo(cx - sx * l, cy)
    }
    g.stroke()
    if (!nave) return
    const w = Math.max(18, r * 1.6)
    const bx = x - w / 2
    const by = y - r - 9
    g.fillStyle = 'rgba(0,0,0,0.55)'
    g.fillRect(bx - 1, by - 1, w + 2, 7)
    g.fillStyle = '#5cc8ff'
    g.fillRect(bx, by, w * (nave.escudo / nave.tipo.escudoMax), 2)
    const f = nave.estructura / nave.tipo.estructuraMax
    g.fillStyle = f > 0.5 ? '#8be07a' : f > 0.25 ? '#ffb648' : '#ff5a4a'
    g.fillRect(bx, by + 3, w * f, 2)
  }

  discoMovimiento(m) {
    const g = this.g
    const e = this.entrada
    const c = m.centro
    const plano = new THREE.Vector3(m.punto.x, c.y, m.punto.z)
    const radio = Math.hypot(plano.x - c.x, plano.z - c.z)
    g.lineWidth = 1.2
    g.strokeStyle = 'rgba(111,224,160,0.55)'
    g.beginPath()
    let primero = true
    const s = {}
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2
      _p.set(c.x + Math.cos(a) * radio, c.y, c.z + Math.sin(a) * radio)
      e.aPantalla(_p, s)
      if (s.z > 1) {
        primero = true
        continue
      }
      primero ? g.moveTo(s.x, s.y) : g.lineTo(s.x, s.y)
      primero = false
    }
    g.stroke()
    // Radios de referencia (como la grilla del disco de Homeworld).
    g.strokeStyle = 'rgba(111,224,160,0.15)'
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      const p0 = e.aPantalla(c, {})
      const p1 = e.aPantalla(_p.set(c.x + Math.cos(a) * radio, c.y, c.z + Math.sin(a) * radio), {})
      if (p0.z < 1 && p1.z < 1) {
        g.beginPath()
        g.moveTo(p0.x, p0.y)
        g.lineTo(p1.x, p1.y)
        g.stroke()
      }
    }
    const pc = e.aPantalla(c, {})
    const pp = e.aPantalla(plano, {})
    const pd = e.aPantalla(m.punto, {})
    this.linea(pc, pp, 'rgba(111,224,160,0.9)')
    // Línea vertical de altura.
    if (Math.abs(m.punto.y - c.y) > 1) {
      g.strokeStyle = m.ajustandoAltura ? '#ffb648' : 'rgba(255,182,72,0.7)'
      g.beginPath()
      g.moveTo(pp.x, pp.y)
      g.lineTo(pd.x, pd.y)
      g.stroke()
    }
    g.strokeStyle = '#6fe0a0'
    g.lineWidth = 2
    g.beginPath()
    g.arc(pd.x, pd.y, 7, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#d3e6f5'
    g.font = '600 12px Rajdhani, sans-serif'
    const dist = Math.round(m.punto.distanceTo(c))
    const alt = Math.round(m.punto.y - c.y)
    g.fillText(`${dist} m${alt ? ` · altura ${alt > 0 ? '+' : ''}${alt}` : ''}`, pd.x + 12, pd.y - 8)
  }
}

export { ENEMIGO }

// Pantallas fuera de la batalla: título, facción, armado de flota y fin.
import { FACCIONES, TIPOS, ORDEN_TIPOS, DIFICULTADES, PRESUPUESTO_BASE, PRESUPUESTOS, PRESUPUESTO_MIN, PRESUPUESTO_MAX } from '../datos.js'
import { MAPAS } from '../sim/terreno.js'

const $ = (s) => document.querySelector(s)

export function mostrarPantalla(id) {
  for (const p of document.querySelectorAll('.pantalla:not(.superpuesta)')) p.classList.toggle('visible', p.id === id)
}

export class Menus {
  constructor({ alCombatir, alAbrirAyuda, alTutorial }) {
    this.config = {
      faccion: 'guardianes',
      dificultad: 'normal',
      calidad: guardado('calidad', 'alta'),
      presupuesto: limitar(Number(guardado('presupuesto', PRESUPUESTO_BASE)) || PRESUPUESTO_BASE),
      flota: { caza: 3, corbeta: 2, bombardero: 2, crucero: 2, acorazado: 0 },
      mapa: guardado('mapa', 'mixto'),
    }
    this.alCombatir = alCombatir
    this.armarFacciones()
    this.armarFlota()
    this.sugerida()

    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accion]')?.dataset.accion
      if (!a) return
      if (a === 'nueva') mostrarPantalla('pantalla-faccion')
      else if (a === 'tutorial') alTutorial()
      else if (a === 'controles') alAbrirAyuda(false)
      else if (a === 'volver-titulo' || a === 'menu') mostrarPantalla('pantalla-titulo')
      else if (a === 'volver-faccion') mostrarPantalla('pantalla-faccion')
      else if (a === 'sugerida') {
        this.sugerida()
      } else if (a === 'combatir' || a === 'revancha') this.alCombatir(this.config)
    })
  }

  cargaLista() {
    $('#cargando').hidden = true
    $('#botones-titulo').hidden = false
  }

  progreso(f) {
    $('#carga-barra').style.width = `${Math.round(f * 100)}%`
  }

  armarFacciones() {
    const lista = $('#lista-facciones')
    lista.innerHTML = ''
    for (const f of Object.values(FACCIONES)) {
      const t = document.createElement('div')
      t.className = 'tarjeta-faccion'
      t.style.setProperty('--color', f.acentoCss)
      t.innerHTML = `
        <div class="imagen" style="background-image:url('${f.imagen}')"></div>
        <div class="cuerpo">
          <h3>${f.nombre}</h3>
          <div class="lema">${f.lema}</div>
          <p>${f.descripcion}</p>
        </div>`
      t.addEventListener('click', () => {
        this.config.faccion = f.clave
        document.documentElement.style.setProperty('--acento', f.acentoCss)
        this.refrescarFlota()
        mostrarPantalla('pantalla-flota')
      })
      lista.appendChild(t)
    }
  }

  armarFlota() {
    const lista = $('#lista-tipos')
    lista.innerHTML = ''
    for (const clave of ORDEN_TIPOS) {
      const t = TIPOS[clave]
      // Contras derivadas de las tablas de ventaja (nada escrito a mano).
      const fuerte = t.ventajaGeneral ? [...Object.keys(t.ventaja ?? {}), 'todo'] : Object.keys(t.ventaja ?? {})
      const debil = ORDEN_TIPOS.filter((k) => k !== clave && TIPOS[k].ventaja?.[clave])
      const nombres = (l) => l.map((k) => (k === 'todo' ? '+25% a todo' : TIPOS[k].nombre)).join(', ') || '—'
      const fila = document.createElement('div')
      fila.className = 'tipo-fila'
      fila.innerHTML = `
        <div class="tipo-info">
          <h4>${t.nombre}<small>${t.porBatallon > 1 ? `batallón de ${t.porBatallon}` : 'nave capital'}</small></h4>
          <div class="rol">${t.rol}</div>
          <div class="stats">
            <span class="at">Ataque <b>${t.ataque}</b></span>
            <span class="es">Escudo <b>${t.escudo}</b></span>
            <span class="et">Estructura <b>${t.estructura}</b></span>
            <span>Velocidad <b>${t.velocidad}</b></span>
          </div>
        </div>
        <div class="tipo-contras">
          <div><span class="fuerte">Fuerte contra</span> ${nombres(fuerte)}</div>
          <div><span class="debil">Débil contra</span> ${nombres(debil)}</div>
        </div>
        <div class="contador">
          <button class="btn" data-menos="${clave}">−</button>
          <span class="n" id="n-${clave}">0</span>
          <button class="btn" data-mas="${clave}">+</button>
          <span class="costo">${t.costo} pts</span>
        </div>`
      lista.appendChild(fila)
    }
    lista.addEventListener('click', (e) => {
      const mas = e.target.dataset.mas
      const menos = e.target.dataset.menos
      if (mas && this.usado() + TIPOS[mas].costo <= this.config.presupuesto) this.config.flota[mas]++
      if (menos && this.config.flota[menos] > 0) this.config.flota[menos]--
      this.refrescarFlota()
    })

    const sd = $('#selector-dificultad')
    for (const [k, d] of Object.entries(DIFICULTADES)) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = d.nombre
      b.dataset.dif = k
      b.onclick = () => {
        this.config.dificultad = k
        this.refrescarFlota()
      }
      sd.appendChild(b)
    }
    const sc = $('#selector-calidad')
    for (const [k, n] of [['alta', 'Alta'], ['baja', 'Liviana']]) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = n
      b.dataset.cal = k
      b.onclick = () => {
        this.config.calidad = k
        try { localStorage.setItem('calidad', k) } catch {}
        this.refrescarFlota()
      }
      sc.appendChild(b)
    }
    const sp = $('#selector-presupuesto')
    for (const p of PRESUPUESTOS) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = p.nombre
      b.title = `${p.valor} puntos`
      b.dataset.pres = p.valor
      b.onclick = () => this.cambiarPresupuesto(p.valor, true)
      sp.appendChild(b)
    }
    const sm = $('#selector-mapa')
    for (const [k, m] of [...Object.entries(MAPAS), ['azar', { corto: 'Al azar', descripcion: 'Un mapa sorpresa.' }]]) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = m.corto
      b.title = m.descripcion
      b.dataset.mapa = k
      b.onclick = () => {
        this.config.mapa = k
        try { localStorage.setItem('mapa', k) } catch {}
        this.refrescarFlota()
      }
      sm.appendChild(b)
    }
    for (const b of document.querySelectorAll('[data-presupuesto]'))
      b.onclick = () => this.cambiarPresupuesto(this.config.presupuesto + Number(b.dataset.presupuesto))
    this.refrescarFlota()
  }

  cambiarPresupuesto(valor, rearmar = false) {
    const c = this.config
    c.presupuesto = limitar(valor)
    try { localStorage.setItem('presupuesto', c.presupuesto) } catch {}
    if (rearmar) return this.sugerida()
    // Si la flota ya no entra, se recorta de lo que más pesa en ella.
    while (this.usado() > c.presupuesto) {
      const k = ORDEN_TIPOS.reduce((a, b) => (c.flota[b] * TIPOS[b].costo > c.flota[a] * TIPOS[a].costo ? b : a))
      c.flota[k]--
    }
    this.refrescarFlota()
  }

  // Flota sugerida para el presupuesto: Acorazados en las batallas grandes y
  // el resto repartido como la mezcla base (3 Cazas, 2 Corbetas, 2
  // Bombarderos, 2 Cruceros), completando lo que sobre.
  sugerida() {
    const p = this.config.presupuesto
    const flota = Object.fromEntries(ORDEN_TIPOS.map((k) => [k, 0]))
    if (p >= 8000) flota.acorazado = Math.floor(p / 8000)
    const mezcla = { caza: 3, corbeta: 2, bombardero: 2, crucero: 2 }
    const costoMezcla = Object.entries(mezcla).reduce((s, [k, n]) => s + TIPOS[k].costo * n, 0)
    const f = (p - flota.acorazado * TIPOS.acorazado.costo) / costoMezcla
    for (const [k, n] of Object.entries(mezcla)) flota[k] = Math.floor(n * f)
    this.config.flota = flota
    for (let agrego = true; agrego; ) {
      agrego = false
      for (const k of ['caza', 'corbeta', 'bombardero', 'crucero'])
        if (this.usado() + TIPOS[k].costo <= p) {
          flota[k]++
          agrego = true
        }
    }
    this.refrescarFlota()
  }

  usado() {
    return ORDEN_TIPOS.reduce((s, k) => s + this.config.flota[k] * TIPOS[k].costo, 0)
  }

  refrescarFlota() {
    for (const k of ORDEN_TIPOS) $(`#n-${k}`).textContent = this.config.flota[k]
    const u = this.usado()
    const total = this.config.presupuesto
    $('#presupuesto-usado').textContent = u
    $('#presupuesto-total').textContent = total
    $('#presupuesto-total-2').textContent = total
    const f = this.config.flota
    const naves = ORDEN_TIPOS.reduce((n, k) => n + f[k] * TIPOS[k].porBatallon, 0)
    const batallones = ORDEN_TIPOS.reduce((n, k) => n + f[k], 0)
    $('#composicion').innerHTML = `<b>${naves}</b> naves en <b>${batallones}</b> batallones<span>${ORDEN_TIPOS.filter((k) => f[k]).map((k) => `${f[k]} ${TIPOS[k].nombre}`).join(' · ')}</span>`
    const fa = FACCIONES[this.config.faccion]
    $('#armado-faccion').innerHTML = `<i style="background:${fa.acentoCss}"></i>${fa.nombre}`
    $('#presupuesto-barra').style.width = `${(u / total) * 100}%`
    for (const b of document.querySelectorAll('[data-pres]')) b.classList.toggle('activo', Number(b.dataset.pres) === total)
    for (const b of document.querySelectorAll('[data-dif]')) b.classList.toggle('activo', b.dataset.dif === this.config.dificultad)
    for (const b of document.querySelectorAll('[data-cal]')) b.classList.toggle('activo', b.dataset.cal === this.config.calidad)
    for (const b of document.querySelectorAll('[data-mapa]')) b.classList.toggle('activo', b.dataset.mapa === this.config.mapa)
    $('#nota-mapa').textContent = (MAPAS[this.config.mapa] ?? { descripcion: 'Un mapa sorpresa.' }).descripcion
    $('#btn-combatir').disabled = u === 0
  }

  mostrarFin(resultado, batalla, segundos) {
    $('#fin-titulo').textContent = resultado === 'victoria' ? 'Victoria' : 'Derrota'
    $('#fin-sub').textContent =
      resultado === 'victoria' ? 'La flota enemiga fue aniquilada' : 'Tu flota fue destruida'
    const [j, e] = batalla.estadisticas
    const m = Math.floor(segundos / 60)
    const s = Math.floor(segundos % 60)
    $('#fin-estadisticas').innerHTML = `
      <span class="cab"></span><span class="cab">Vos</span><span class="cab">Enemigo</span>
      <span>Naves destruidas</span><b>${j.destruidas}</b><b>${e.destruidas}</b>
      <span>Naves perdidas</span><b>${j.perdidas}</b><b>${e.perdidas}</b>
      <span>Daño causado</span><b>${Math.round(j.daño)}</b><b>${Math.round(e.daño)}</b>
      <span>Duración</span><b>${m}:${String(s).padStart(2, '0')}</b><span></span>`
    mostrarPantalla('pantalla-fin')
  }
}

function limitar(v) {
  return Math.min(PRESUPUESTO_MAX, Math.max(PRESUPUESTO_MIN, Math.round(v / 500) * 500))
}

function guardado(clave, porDefecto) {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}

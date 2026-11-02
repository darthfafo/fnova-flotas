// Pantallas fuera de la batalla: título, facción, armado de flota y fin.
import { FACCIONES, TIPOS, ORDEN_TIPOS, DIFICULTADES, PRESUPUESTO_BASE } from '../datos.js'

const $ = (s) => document.querySelector(s)

export function mostrarPantalla(id) {
  for (const p of document.querySelectorAll('.pantalla:not(.superpuesta)')) p.classList.toggle('visible', p.id === id)
}

export class Menus {
  constructor({ alCombatir, alAbrirAyuda }) {
    this.config = {
      faccion: 'guardianes',
      dificultad: 'normal',
      calidad: guardado('calidad', 'alta'),
      flota: { caza: 3, corbeta: 2, bombardero: 2, crucero: 2, acorazado: 0 },
    }
    this.alCombatir = alCombatir
    this.armarFacciones()
    this.armarFlota()

    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accion]')?.dataset.accion
      if (!a) return
      if (a === 'nueva') mostrarPantalla('pantalla-faccion')
      else if (a === 'controles') alAbrirAyuda(false)
      else if (a === 'volver-titulo' || a === 'menu') mostrarPantalla('pantalla-titulo')
      else if (a === 'volver-faccion') mostrarPantalla('pantalla-faccion')
      else if (a === 'sugerida') {
        this.config.flota = { caza: 3, corbeta: 2, bombardero: 2, crucero: 2, acorazado: 0 }
        this.refrescarFlota()
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
      const fila = document.createElement('div')
      fila.className = 'tipo-fila'
      fila.innerHTML = `
        <div>
          <h4>${t.nombre}<small>${t.porBatallon > 1 ? `batallón de ${t.porBatallon} naves` : 'nave capital'}</small></h4>
          <div class="rol">${t.rol}</div>
          <div class="stats">
            <span class="at">Ataque <b>${t.ataque}</b></span>
            <span class="es">Escudo <b>${t.escudo}</b></span>
            <span class="et">Estructura <b>${t.estructura}</b></span>
            <span>Velocidad <b>${t.velocidad}</b></span>
          </div>
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
      if (mas && this.usado() + TIPOS[mas].costo <= PRESUPUESTO_BASE) this.config.flota[mas]++
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
    $('#presupuesto-total').textContent = PRESUPUESTO_BASE
    this.refrescarFlota()
  }

  usado() {
    return ORDEN_TIPOS.reduce((s, k) => s + this.config.flota[k] * TIPOS[k].costo, 0)
  }

  refrescarFlota() {
    for (const k of ORDEN_TIPOS) $(`#n-${k}`).textContent = this.config.flota[k]
    const u = this.usado()
    $('#presupuesto-usado').textContent = u
    $('#presupuesto-barra').style.width = `${(u / PRESUPUESTO_BASE) * 100}%`
    for (const b of document.querySelectorAll('[data-dif]')) b.classList.toggle('activo', b.dataset.dif === this.config.dificultad)
    for (const b of document.querySelectorAll('[data-cal]')) b.classList.toggle('activo', b.dataset.cal === this.config.calidad)
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

function guardado(clave, porDefecto) {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}

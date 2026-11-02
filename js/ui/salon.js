// Interfaz de cuentas y del Salón de la Fama: la ventana para ingresar o
// crear un comandante, la tabla por dificultad y el guardado del resultado
// en el informe de batalla.
import { FACCIONES, DIFICULTADES, PRESUPUESTOS } from '../datos.js'
import { MAPAS } from '../sim/terreno.js'
import { mostrarPantalla, bloqueRasgo } from './menus.js'

const $ = (s) => document.querySelector(s)
const n = (x) => Math.round(x).toLocaleString('es-AR')
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export class Salon {
  constructor(cuenta) {
    this.cuenta = cuenta
    this.modo = 'ingresar'
    this.dificultad = 'normal'
    this.pendiente = null // resultado de la última batalla, si todavía no se guardó

    cuenta.alCambiar(() => {
      this.refrescarBoton()
      if ($('#pantalla-cuenta').classList.contains('visible')) this.dibujarCuenta()
    })
    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accion]')?.dataset.accion
      if (a === 'cuenta') this.abrirCuenta()
      if (a === 'cerrar-cuenta') this.cerrarCuenta()
      if (a === 'salon') this.abrirSalon()
      if (a === 'modo-cuenta') {
        this.modo = e.target.closest('[data-modo]').dataset.modo
        this.dibujarCuenta()
      }
      if (a === 'salir') this.cuenta.salir()
      if (a === 'guardar-pendiente') this.abrirCuenta()
    })
    document.body.addEventListener('change', (e) => {
      if (e.target.id === 'select-faccion') this.mostrarRasgo(e.target.value)
    })
    document.body.addEventListener('submit', (e) => {
      if (e.target.id === 'form-cuenta') {
        e.preventDefault()
        this.enviarFormulario(e.target)
      }
    })
    const tabs = $('#salon-tabs')
    for (const [k, d] of Object.entries(DIFICULTADES)) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = d.nombre
      b.dataset.salonDif = k
      b.onclick = () => {
        this.dificultad = k
        this.cargarTabla()
      }
      tabs.appendChild(b)
    }
    this.refrescarBoton()
  }

  refrescarBoton() {
    const b = $('#btn-cuenta')
    const p = this.cuenta.perfil
    b.innerHTML = p ? `<i class="rombo" style="background:${FACCIONES[p.faccion ?? 'guardianes'].acentoCss}"></i>${escapar(p.nombre)}` : 'Iniciar sesión'
    b.classList.toggle('conectado', !!p)
  }

  // --- Ventana de cuenta ------------------------------------------------------

  abrirCuenta() {
    // Una cuenta sin perfil (registro cortado a la mitad) pasa directo a elegir nombre.
    if (this.cuenta.usuario && !this.cuenta.perfil) this.modo = 'perfil'
    this.dibujarCuenta()
    $('#pantalla-cuenta').classList.add('visible')
    $('#pantalla-cuenta input')?.focus()
  }

  cerrarCuenta() {
    $('#pantalla-cuenta').classList.remove('visible')
  }

  dibujarCuenta() {
    const c = $('#cuenta-contenido')
    const p = this.cuenta.perfil
    if (p) {
      const f = FACCIONES[p.faccion ?? 'guardianes']
      c.innerHTML = `
        <div class="encabezado">Comandante</div>
        <div class="perfil-nombre" style="--color:${f.acentoCss}">${escapar(p.nombre)}</div>
        <div class="perfil-faccion" style="color:${f.acentoCss}">${f.nombre}</div>
        <p class="nota">Tus victorias se guardan en el Salón de la Fama.</p>
        <div class="botonera">
          <button class="btn" data-accion="salon">Ver Salón de la Fama</button>
          <button class="btn" data-accion="salir">Cerrar sesión</button>
        </div>`
      return
    }
    const crear = this.modo === 'crear' || this.modo === 'perfil'
    const soloPerfil = this.modo === 'perfil'
    c.innerHTML = `
      <div class="encabezado">${soloPerfil ? 'Elegí tu nombre' : crear ? 'Nuevo comandante' : 'Ingresar'}</div>
      ${soloPerfil ? '' : `<div class="selector tabs-cuenta">
        <button type="button" class="btn ${crear ? '' : 'activo'}" data-accion="modo-cuenta" data-modo="ingresar">Ingresar</button>
        <button type="button" class="btn ${crear ? 'activo' : ''}" data-accion="modo-cuenta" data-modo="crear">Crear cuenta</button>
      </div>`}
      <form id="form-cuenta" class="form-cuenta">
        ${crear ? `<label>Nombre de comandante<input name="nombre" maxlength="20" minlength="3" required autocomplete="nickname" placeholder="Como te van a ver en el ranking" /></label>
        <label>Facción<select name="faccion" id="select-faccion">${Object.values(FACCIONES).map((f) => `<option value="${f.clave}">${f.nombre}</option>`).join('')}</select></label>
        <div class="nota-faccion" id="nota-faccion" style="--color:${FACCIONES.guardianes.acentoCss}">${bloqueRasgo(FACCIONES.guardianes)}</div>
        <p class="nota">Tu facción define tus naves y su rasgo en batalla. Con <b>Partida rápida</b> podés probar la otra cuando quieras.</p>` : ''}
        ${soloPerfil ? '' : `<label>Email<input name="email" type="email" required autocomplete="email" /></label>
        <label>Contraseña<input name="contraseña" type="password" minlength="6" required autocomplete="${crear ? 'new-password' : 'current-password'}" placeholder="${crear ? 'Al menos 6 caracteres' : ''}" /></label>`}
        <div class="error-cuenta" id="error-cuenta"></div>
        <button class="btn grande" type="submit">${soloPerfil ? 'Guardar' : crear ? 'Crear comandante' : 'Ingresar'}</button>
      </form>
      ${this.pendiente ? '<p class="nota">Al ingresar se guarda también el resultado de la batalla que acabás de jugar.</p>' : ''}`
  }

  // Al elegir facción en el formulario se muestra su rasgo de batalla.
  mostrarRasgo(clave) {
    const nota = $('#nota-faccion')
    if (!nota) return
    nota.style.setProperty('--color', FACCIONES[clave].acentoCss)
    nota.innerHTML = bloqueRasgo(FACCIONES[clave])
  }

  async enviarFormulario(form) {
    const datos = Object.fromEntries(new FormData(form))
    const boton = form.querySelector('button[type=submit]')
    const error = $('#error-cuenta')
    error.textContent = ''
    boton.disabled = true
    try {
      if (this.modo === 'crear') await this.cuenta.registrar(datos)
      else if (this.modo === 'perfil') await this.cuenta.crearPerfil(datos)
      else await this.cuenta.ingresar(datos)
      if (this.cuenta.usuario && !this.cuenta.perfil) {
        this.modo = 'perfil'
        this.dibujarCuenta()
        return
      }
      this.cerrarCuenta()
      if (this.pendiente) this.guardarPendiente()
    } catch (e) {
      error.textContent = e.message
    } finally {
      boton.disabled = false
    }
  }

  // --- Resultado de la batalla ------------------------------------------------

  async alTerminarBatalla(datos) {
    this.pendiente = datos
    if (this.cuenta.conectado) return this.guardarPendiente()
    $('#fin-ranking').innerHTML = `<span>Este resultado no entra al Salón de la Fama sin una cuenta.</span>
      <button class="btn chico" data-accion="guardar-pendiente">Ingresar y guardar</button>`
  }

  async guardarPendiente() {
    const datos = this.pendiente
    if (!datos) return
    const el = $('#fin-ranking')
    el.innerHTML = '<span>Guardando en el Salón de la Fama…</span>'
    try {
      const r = await this.cuenta.guardarResultado(datos)
      this.pendiente = null
      const dif = DIFICULTADES[datos.config.dificultad].nombre
      if (!r) el.innerHTML = `<span>Resultado guardado. Solo las victorias entran al ranking de ${dif}.</span>`
      else
        el.innerHTML = `<span>Puntaje guardado.</span><b>Puesto #${r.puesto}</b><span>en ${dif}${
          r.mejor > datos.informe.puntaje ? ` · tu mejor marca sigue siendo ${n(r.mejor)}` : ' · ¡nueva mejor marca!'
        }</span><button class="btn chico" data-accion="salon">Ver ranking</button>`
      this.dificultad = datos.config.dificultad
    } catch (e) {
      el.innerHTML = `<span class="error-cuenta">No se pudo guardar: ${escapar(e.message)}</span>`
    }
  }

  // --- Salón de la Fama ---------------------------------------------------------

  abrirSalon() {
    this.cerrarCuenta()
    mostrarPantalla('pantalla-salon')
    this.cargarTabla()
  }

  async cargarTabla() {
    for (const b of document.querySelectorAll('[data-salon-dif]')) b.classList.toggle('activo', b.dataset.salonDif === this.dificultad)
    const tabla = $('#salon-tabla')
    const pie = $('#salon-pie')
    tabla.innerHTML = '<div class="salon-vacio">Consultando los archivos del Crisol…</div>'
    pie.innerHTML = ''
    let filas
    try {
      filas = await this.cuenta.ranking(this.dificultad)
    } catch (e) {
      tabla.innerHTML = `<div class="salon-vacio">No se pudo cargar el ranking: ${escapar(e.message)}</div>`
      return
    }
    const yo = this.cuenta.usuario?.id
    if (!filas.length) {
      tabla.innerHTML = `<div class="salon-vacio">Todavía nadie ganó en ${DIFICULTADES[this.dificultad].nombre}. El primer puesto está libre.</div>`
    } else {
      tabla.innerHTML = `<table class="tabla-salon">
        <thead><tr><th>#</th><th>Comandante</th><th class="num">Puntaje</th><th>Batalla</th><th>Mapa</th><th class="num">Tiempo</th><th class="num">Victorias</th><th>Fecha</th></tr></thead>
        <tbody>${filas
          .map((f, i) => {
            const fa = FACCIONES[f.faccion]
            const tam = PRESUPUESTOS.find((p) => p.valor === f.presupuesto)?.nombre ?? `${n(f.presupuesto)} pts`
            const t = `${Math.floor(f.duracion / 60)}:${String(f.duracion % 60).padStart(2, '0')}`
            return `<tr class="${f.jugador === yo ? 'propia' : ''} ${i < 3 ? 'podio p' + (i + 1) : ''}">
              <td class="puesto">${i + 1}</td>
              <td><i class="rombo" style="background:${fa.acentoCss}"></i>${escapar(f.nombre)}</td>
              <td class="num puntos">${n(f.puntaje)}</td>
              <td>${tam}</td>
              <td>${MAPAS[f.mapa]?.corto ?? f.mapa}</td>
              <td class="num">${t}</td>
              <td class="num">${f.victorias}</td>
              <td>${new Date(f.creado).toLocaleDateString('es-AR')}</td>
            </tr>`
          })
          .join('')}</tbody></table>`
    }
    if (!this.cuenta.conectado) pie.innerHTML = '<span>Ingresá con tu comandante para que tus victorias aparezcan acá.</span><button class="btn chico" data-accion="cuenta">Iniciar sesión</button>'
    else if (!filas.some((f) => f.jugador === yo)) {
      const r = await this.cuenta.puesto(this.dificultad).catch(() => null)
      pie.innerHTML = r ? `<span>Tu puesto en ${DIFICULTADES[this.dificultad].nombre}: <b>#${r.puesto}</b> con ${n(r.mejor)}</span>` : `<span>Todavía no ganaste en ${DIFICULTADES[this.dificultad].nombre}.</span>`
    }
  }
}

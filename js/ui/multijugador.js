// Multijugador: lista de batallas que esperan rival, crear una sala, unirse,
// y el armado de flota compartido ("Listo" de cada lado) hasta que el
// anfitrión arranca la batalla.
//
// Mensajes del canal antes de la batalla:
//   hola  {nombre, faccion}          al conectarse (y como respuesta)
//   listo {flota, faccion, nombre}   la flota armada; null para "ya no estoy listo"
//   inicio {descripción}             el anfitrión manda la batalla armada (ver red/partida.js)
import { FACCIONES, PRESUPUESTOS, TIPOS, ORDEN_TIPOS } from '../datos.js'
import { MAPAS } from '../sim/terreno.js'
import { listarSalas, crearSala, unirseASala, borrarSala, cambiarEstadoSala, abrirCanal } from '../red/sala.js'
import { mostrarPantalla } from './menus.js'

const $ = (s) => document.querySelector(s)
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const LOCAL = new URLSearchParams(location.search).get('red') === 'local'

export class Multijugador {
  constructor({ menus, cuenta, salon, alIniciar }) {
    this.menus = menus
    this.cuenta = cuenta
    this.salon = salon
    this.alIniciar = alIniciar // (rol, canal, datos) → arranca la batalla en red
    this.opciones = { presupuesto: 4500, mapa: 'mixto' }
    this.sala = null
    this.canal = null
    this.rol = null
    this.rival = null

    for (const p of PRESUPUESTOS) this.boton('#multi-tamaño', p.nombre, () => (this.opciones.presupuesto = p.valor), () => this.opciones.presupuesto === p.valor)
    for (const [k, m] of [...Object.entries(MAPAS), ['azar', { corto: 'Al azar' }]])
      this.boton('#multi-mapa', m.corto, () => (this.opciones.mapa = k), () => this.opciones.mapa === k)

    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accion]')
      if (!a) return
      const accion = a.dataset.accion
      if (accion === 'multijugador') this.abrir()
      if (accion === 'salir-multi') this.salir()
      if (accion === 'crear-sala') this.crear()
      if (accion === 'unirse-sala') this.unirse(a.dataset.sala)
      if (accion === 'cancelar-sala') this.salir(true)
    })
    // El botón "Listo" del armado de flota en modo multijugador.
    menus.alListo = (config) => this.marcarListo(config)
  }

  boton(selector, texto, alElegir, activo) {
    const b = document.createElement('button')
    b.className = 'btn'
    b.textContent = texto
    b.onclick = () => {
      alElegir()
      this.refrescarSelectores()
    }
    b.dataset.activo = ''
    b._activo = activo
    $(selector).appendChild(b)
  }

  refrescarSelectores() {
    for (const b of document.querySelectorAll('#multi-tamaño .btn, #multi-mapa .btn')) b.classList.toggle('activo', b._activo())
  }

  // --- Sala de espera ----------------------------------------------------------

  abrir() {
    if (!LOCAL && !this.cuenta.conectado) {
      this.salon.pedirCuenta('Para jugar contra otros comandantes necesitás una cuenta.', () => this.abrir())
      return
    }
    this.refrescarSelectores()
    $('#multi-crear').hidden = false
    $('#multi-estado').innerHTML = ''
    mostrarPantalla('pantalla-multi')
    this.cargarLista()
    clearInterval(this.relojLista)
    this.relojLista = setInterval(() => this.cargarLista(), 4000)
  }

  async cargarLista() {
    const el = $('#multi-lista')
    let salas
    try {
      salas = LOCAL ? [{ id: 'local', presupuesto: 4500, mapa: 'mixto', perfiles: { nombre: 'Pestaña local', faccion: 'guardianes' } }] : await listarSalas()
    } catch (e) {
      el.innerHTML = `<div class="salon-vacio">No se pudo cargar la lista: ${escapar(e.message)}</div>`
      return
    }
    const mia = this.sala?.id
    salas = salas.filter((s) => s.id !== mia || LOCAL)
    if (!salas.length) {
      el.innerHTML = '<div class="salon-vacio">Nadie está esperando ahora. Creá una batalla y avisale a un amigo.</div>'
      return
    }
    el.innerHTML = salas
      .map((s) => {
        const f = FACCIONES[s.perfiles?.faccion ?? 'guardianes']
        const tam = PRESUPUESTOS.find((p) => p.valor === s.presupuesto)?.nombre ?? `${s.presupuesto} pts`
        return `<div class="fila-sala">
          <span><i class="rombo" style="background:${f.acentoCss}"></i><b>${escapar(s.perfiles?.nombre ?? '¿?')}</b> <small>${f.nombre}</small></span>
          <span>${tam}</span><span>${MAPAS[s.mapa]?.corto ?? 'Al azar'}</span>
          <button class="btn chico" data-accion="unirse-sala" data-sala="${s.id}">Unirse</button>
        </div>`
      })
      .join('')
  }

  async crear() {
    try {
      this.sala = LOCAL ? { id: 'local', ...this.opciones } : await crearSala(this.opciones)
      this.rol = 'anfitrion'
      await this.conectar()
      $('#multi-crear').hidden = true
      $('#multi-estado').innerHTML = `<div class="esperando"><span class="latido">Esperando rival…</span>
        <span>Tu batalla aparece en la lista de los demás comandantes.</span>
        <button class="btn chico" data-accion="cancelar-sala">Cancelar</button></div>`
    } catch (e) {
      $('#multi-estado').innerHTML = `<span class="error-cuenta">${escapar(e.message)}</span>`
    }
  }

  async unirse(id) {
    try {
      this.sala = LOCAL ? { id: 'local', presupuesto: 4500, mapa: 'mixto' } : await unirseASala(id)
      this.rol = 'invitado'
      await this.conectar()
      this.irAlArmado()
    } catch (e) {
      $('#multi-estado').innerHTML = `<span class="error-cuenta">${escapar(e.message)}</span>`
      this.cargarLista()
    }
  }

  yo() {
    const p = this.cuenta.perfil
    return { nombre: p?.nombre ?? (this.rol === 'anfitrion' ? 'Anfitrión' : 'Invitado'), faccion: p?.faccion ?? (this.rol === 'anfitrion' ? 'guardianes' : 'inquisidores') }
  }

  async conectar() {
    this.canal = await abrirCanal(this.sala.id, this.rol)
    this.listoPropio = null
    this.listoRival = null
    this.canal.al('hola', (d) => {
      const nuevo = !this.rival
      this.rival = d
      if (nuevo) this.canal.enviar('hola', this.yo())
      if (this.rol === 'anfitrion' && document.querySelector('#pantalla-multi.visible')) this.irAlArmado()
      this.refrescarEstadoRival()
    })
    this.canal.al('listo', (d) => {
      this.listoRival = d
      this.refrescarEstadoRival()
      this.intentarEmpezar()
    })
    this.canal.al('inicio', (descripcion) => {
      if (this.rol !== 'invitado') return
      this.alIniciar('invitado', this.canal, { descripcion, config: { ...this.menus.config } })
    })
    this.canal.alSalirRival(() => {
      if (this.enBatalla) return // de eso se encarga la batalla
      this.rival = null
      this.listoRival = null
      this.refrescarEstadoRival('Tu rival se fue de la sala.')
    })
    this.canal.enviar('hola', this.yo())
  }

  // Los dos pasan al armado de flota con el presupuesto de la sala.
  irAlArmado() {
    clearInterval(this.relojLista)
    if (this.rol === 'anfitrion' && !LOCAL) cambiarEstadoSala(this.sala.id, 'armando')
    const m = this.menus
    m.modo = 'multi'
    m.config.faccion = this.yo().faccion
    m.cambiarPresupuesto(this.sala.presupuesto, true)
    document.documentElement.style.setProperty('--acento', FACCIONES[m.config.faccion].acentoCss)
    document.querySelector('#pantalla-flota').classList.add('modo-multi')
    $('#btn-combatir').textContent = 'Listo'
    this.refrescarEstadoRival()
    mostrarPantalla('pantalla-flota')
  }

  refrescarEstadoRival(aviso) {
    const el = $('#estado-rival')
    if (!el) return
    if (aviso) return (el.textContent = aviso)
    if (!this.rival) return (el.textContent = 'Esperando que se conecte tu rival…')
    const f = FACCIONES[this.rival.faccion]
    el.innerHTML = `<i class="rombo" style="background:${f.acentoCss}"></i>${escapar(this.rival.nombre)}: ${this.listoRival ? '<b>¡Listo!</b>' : 'armando su flota…'}`
  }

  marcarListo(config) {
    const boton = $('#btn-combatir')
    if (this.listoPropio) {
      this.listoPropio = null
      boton.textContent = 'Listo'
      this.canal.enviar('listo', null)
      return
    }
    this.listoPropio = { flota: { ...config.flota }, faccion: config.faccion, nombre: this.yo().nombre }
    boton.textContent = 'Esperando… (tocá para cambiar)'
    this.canal.enviar('listo', this.listoPropio)
    this.intentarEmpezar()
  }

  // El anfitrión arranca cuando los dos están listos.
  intentarEmpezar() {
    if (this.rol !== 'anfitrion' || !this.listoPropio || !this.listoRival) return
    const flotaRival = recortar(this.listoRival.flota, this.sala.presupuesto)
    if (!LOCAL) cambiarEstadoSala(this.sala.id, 'jugando')
    this.enBatalla = true
    this.alIniciar('anfitrion', this.canal, {
      config: { ...this.menus.config, mapa: this.sala.mapa, presupuesto: this.sala.presupuesto },
      flotaRival,
      faccionRival: this.listoRival.faccion,
      nombreRival: this.listoRival.nombre,
    })
  }

  // Al terminar o abandonar: se cierra el canal y la sala.
  async terminar() {
    this.enBatalla = false
    await this.canal?.cerrar()
    if (this.rol === 'anfitrion' && this.sala && !LOCAL) borrarSala(this.sala.id)
    this.canal = null
    this.sala = null
    this.rival = null
    this.listoPropio = null
    this.listoRival = null
    this.salirDelModo()
  }

  salirDelModo() {
    this.menus.modo = 'normal'
    document.querySelector('#pantalla-flota').classList.remove('modo-multi')
    $('#btn-combatir').textContent = 'Al combate'
    $('#estado-rival').textContent = ''
  }

  async salir(quedarse) {
    clearInterval(this.relojLista)
    await this.terminar()
    if (quedarse) this.abrir()
    else mostrarPantalla('pantalla-titulo')
  }
}

// La flota del rival no puede pasarse del presupuesto de la sala.
function recortar(flota, presupuesto) {
  const f = Object.fromEntries(ORDEN_TIPOS.map((k) => [k, Math.max(0, Math.floor(flota?.[k] ?? 0))]))
  const costo = () => ORDEN_TIPOS.reduce((s, k) => s + f[k] * TIPOS[k].costo, 0)
  while (costo() > presupuesto) {
    const k = [...ORDEN_TIPOS].reverse().find((x) => f[x] > 0)
    f[k]--
  }
  return f
}

// Salas de multijugador (tabla "salas" en Supabase) y el canal por el que
// viajan los mensajes de una partida.
//
// El canal es Supabase Realtime (broadcast + presencia). Para probar en una
// sola computadora existe un canal local entre pestañas del mismo navegador
// (BroadcastChannel): se activa abriendo el juego con ?red=local.
import { supabase } from './cuenta.js'

const VIGENCIA_MINUTOS = 30

export async function listarSalas() {
  const sb = await supabase()
  const desde = new Date(Date.now() - VIGENCIA_MINUTOS * 60000).toISOString()
  const { data, error } = await sb
    .from('salas')
    .select('id, presupuesto, mapa, creado, anfitrion, perfiles!salas_anfitrion_fkey(nombre, faccion)')
    .eq('estado', 'esperando')
    .gt('creado', desde)
    .order('creado', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return data
}

export async function crearSala({ presupuesto, mapa }) {
  const sb = await supabase()
  const { data, error } = await sb.from('salas').insert({ presupuesto, mapa }).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function unirseASala(id) {
  const sb = await supabase()
  const { data, error } = await sb.rpc('unirse_a_sala', { p_sala: id })
  if (error) throw new Error(/no está disponible/.test(error.message) ? 'Esa sala ya no está disponible.' : error.message)
  return data
}

export async function cambiarEstadoSala(id, estado) {
  const sb = await supabase()
  await sb.from('salas').update({ estado }).eq('id', id)
}

export async function borrarSala(id) {
  const sb = await supabase()
  await sb.from('salas').delete().eq('id', id)
}

// --- Canal de la partida -------------------------------------------------------
// Interfaz común: enviar(evento, datos), al(evento, fn), alSalirRival(fn), cerrar().

export async function abrirCanal(salaId, rol) {
  if (new URLSearchParams(location.search).get('red') === 'local') return new CanalLocal(salaId, rol)
  const canal = new CanalSupabase(salaId, rol)
  await canal.conectar()
  return canal
}

class CanalBase {
  constructor(rol) {
    this.rol = rol
    this.manejadores = {}
    this.alSalir = null
    this.rivalPresente = false
  }

  al(evento, fn) {
    this.manejadores[evento] = fn
  }

  alSalirRival(fn) {
    this.alSalir = fn
  }

  recibir(evento, datos) {
    this.manejadores[evento]?.(datos)
  }
}

class CanalSupabase extends CanalBase {
  constructor(salaId, rol) {
    super(rol)
    this.salaId = salaId
  }

  async conectar() {
    const sb = await supabase()
    this.canal = sb.channel(`sala-${this.salaId}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.rol } },
    })
    this.canal.on('broadcast', { event: 'm' }, ({ payload }) => this.recibir(payload.e, payload.d))
    this.canal.on('presence', { event: 'sync' }, () => {
      const estado = this.canal.presenceState()
      const otro = this.rol === 'anfitrion' ? 'invitado' : 'anfitrion'
      const presente = !!estado[otro]?.length
      if (this.rivalPresente && !presente) this.alSalir?.()
      this.rivalPresente = presente
    })
    await new Promise((ok, mal) => {
      this.canal.subscribe(async (estado) => {
        if (estado === 'SUBSCRIBED') {
          await this.canal.track({ rol: this.rol, desde: Date.now() })
          ok()
        } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') mal(new Error('No se pudo conectar con la sala.'))
      })
    })
  }

  enviar(evento, datos) {
    this.canal?.send({ type: 'broadcast', event: 'm', payload: { e: evento, d: datos } })
  }

  async cerrar() {
    const sb = await supabase()
    if (this.canal) await sb.removeChannel(this.canal)
    this.canal = null
  }
}

// Canal entre pestañas del mismo navegador, para probar sin internet ni cuentas.
class CanalLocal extends CanalBase {
  constructor(salaId, rol) {
    super(rol)
    this.bc = new BroadcastChannel(`fnova-sala-${salaId}`)
    this.bc.onmessage = ({ data }) => {
      if (data.de === this.rol) return
      if (data.e === '__hola') {
        if (!this.rivalPresente) this.bc.postMessage({ de: this.rol, e: '__hola' })
        this.rivalPresente = true
        return
      }
      if (data.e === '__chau') return this.alSalir?.()
      this.recibir(data.e, data.d)
    }
    this.bc.postMessage({ de: this.rol, e: '__hola' })
    this.alCerrarPestaña = () => this.bc.postMessage({ de: this.rol, e: '__chau' })
    window.addEventListener('pagehide', this.alCerrarPestaña)
  }

  enviar(evento, datos) {
    this.bc.postMessage({ de: this.rol, e: evento, d: datos })
  }

  async cerrar() {
    window.removeEventListener('pagehide', this.alCerrarPestaña)
    this.bc.close()
  }
}

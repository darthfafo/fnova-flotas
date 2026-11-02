// Cuentas de comandante y Salón de la Fama, sobre Supabase (auth + Postgres).
// La URL y la clave publicable son públicas por diseño: la seguridad la
// ponen las reglas de la base (ver supabase/esquema.sql). Si Supabase no
// responde, el juego sigue andando igual: solo no se guardan resultados.

const URL_SUPABASE = 'https://pyqmcbnmzgitibkkpqmq.supabase.co'
const CLAVE_PUBLICA = 'sb_publishable__4HVrjg8bxpFdEK0UCEjLQ_7RtbjoOm'
const BIBLIOTECA = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm'

let cliente = null
async function supabase() {
  if (!cliente) {
    const { createClient } = await import(BIBLIOTECA)
    cliente = createClient(URL_SUPABASE, CLAVE_PUBLICA, { auth: { persistSession: true, autoRefreshToken: true } })
  }
  return cliente
}

// Traduce los errores más comunes de Supabase al castellano del juego.
function traducir(error) {
  const m = error?.message ?? String(error)
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.'
  if (/already registered|already been registered|User already/i.test(m)) return 'Ya hay una cuenta con ese email.'
  if (/Password should be at least/i.test(m)) return 'La contraseña tiene que tener al menos 6 caracteres.'
  if (/valid email|invalid format|email address .* invalid/i.test(m)) return 'Ese email no parece válido.'
  if (/perfiles_nombre_unico|duplicate key/i.test(m)) return 'Ese nombre de comandante ya está tomado.'
  if (/nombre_valido/i.test(m)) return 'El nombre debe tener entre 3 y 20 letras, números o espacios.'
  if (/Demasiados resultados/i.test(m)) return 'Demasiados resultados seguidos, esperá unos segundos.'
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Probá de nuevo en un rato.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No hay conexión con el servidor.'
  return m
}

export class Cuenta {
  constructor() {
    this.usuario = null
    this.perfil = null
    this.escuchas = new Set()
  }

  get conectado() {
    return !!this.perfil
  }

  alCambiar(fn) {
    this.escuchas.add(fn)
  }

  avisar() {
    for (const fn of this.escuchas) fn(this)
  }

  // Recupera la sesión guardada en el navegador, si había.
  async iniciar() {
    try {
      const sb = await supabase()
      const { data } = await sb.auth.getSession()
      this.usuario = data.session?.user ?? null
      if (this.usuario) await this.cargarPerfil()
    } catch (e) {
      console.warn('Supabase no disponible:', e)
    }
    this.avisar()
  }

  async cargarPerfil() {
    const sb = await supabase()
    const { data } = await sb.from('perfiles').select('id, nombre, faccion').eq('id', this.usuario.id).maybeSingle()
    this.perfil = data ?? null
  }

  async registrar({ nombre, email, contraseña, faccion }) {
    nombre = nombre.trim()
    if (nombre.length < 3 || nombre.length > 20) throw new Error('El nombre debe tener entre 3 y 20 caracteres.')
    const sb = await supabase()
    const { data: tomado } = await sb.from('perfiles').select('id').ilike('nombre', nombre).maybeSingle()
    if (tomado) throw new Error('Ese nombre de comandante ya está tomado.')
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password: contraseña })
    if (error) throw new Error(traducir(error))
    if (!data.session) throw new Error('La cuenta se creó pero hay que confirmarla por email. Revisá tu correo.')
    this.usuario = data.user
    const { error: e2 } = await sb.from('perfiles').insert({ id: this.usuario.id, nombre, faccion })
    if (e2) throw new Error(traducir(e2))
    await this.cargarPerfil()
    this.avisar()
  }

  async ingresar({ email, contraseña }) {
    const sb = await supabase()
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: contraseña })
    if (error) throw new Error(traducir(error))
    this.usuario = data.user
    await this.cargarPerfil()
    this.avisar()
  }

  // Cuenta creada sin perfil (por ejemplo, si se cortó la conexión justo al registrarse).
  async crearPerfil({ nombre, faccion }) {
    const sb = await supabase()
    const { error } = await sb.from('perfiles').insert({ id: this.usuario.id, nombre: nombre.trim(), faccion })
    if (error) throw new Error(traducir(error))
    await this.cargarPerfil()
    this.avisar()
  }

  async salir() {
    const sb = await supabase()
    await sb.auth.signOut()
    this.usuario = null
    this.perfil = null
    this.avisar()
  }

  // Guarda el resultado de una batalla. Devuelve el puesto en el ranking de
  // esa dificultad (o null si fue derrota).
  async guardarResultado({ informe, config, mapa, faccion }) {
    if (!this.conectado) throw new Error('No hay sesión iniciada.')
    const sb = await supabase()
    const [yo, rival] = informe.lados
    const { error } = await sb.from('resultados').insert({
      resultado: informe.resultado,
      dificultad: config.dificultad,
      presupuesto: config.presupuesto,
      mapa,
      faccion,
      puntaje: informe.puntaje,
      duracion: Math.round(informe.segundos),
      naves_destruidas: rival.naves - rival.quedan,
      naves_perdidas: yo.naves - yo.quedan,
    })
    if (error) throw new Error(traducir(error))
    if (informe.resultado !== 'victoria') return null
    return this.puesto(config.dificultad)
  }

  // Puesto actual del jugador en el ranking de una dificultad.
  async puesto(dificultad) {
    const sb = await supabase()
    const { data: mio } = await sb.from('ranking').select('puntaje').eq('dificultad', dificultad).eq('jugador', this.usuario.id).maybeSingle()
    if (!mio) return null
    const { count } = await sb.from('ranking').select('jugador', { count: 'exact', head: true }).eq('dificultad', dificultad).gt('puntaje', mio.puntaje)
    return { puesto: (count ?? 0) + 1, mejor: mio.puntaje }
  }

  async ranking(dificultad, limite = 25) {
    const sb = await supabase()
    const { data, error } = await sb
      .from('ranking')
      .select('jugador, nombre, faccion, puntaje, presupuesto, mapa, duracion, creado, victorias')
      .eq('dificultad', dificultad)
      .order('puntaje', { ascending: false })
      .limit(limite)
    if (error) throw new Error(traducir(error))
    return data
  }
}

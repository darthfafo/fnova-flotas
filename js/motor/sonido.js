// Sonido sintetizado con Web Audio: no hay archivos que bajar. Cada efecto
// es un oscilador o ruido filtrado de fracciones de segundo. El volumen baja
// con la distancia a la cámara y hay un tope de voces por tipo, para que una
// batalla grande no sature.

const TOPE_POR_TIPO = { laser: 6, flak: 5, cañon: 4, torpedo: 3, impacto: 5, escudo: 4, explosion: 4, grande: 3 }
const ALCANCE_AUDIBLE = 2600

export class Sonido {
  constructor() {
    this.ctx = null
    this.activo = leer('sonido', 'si') === 'si'
    this.voces = {}
    this.escala = 1 // volumen de los efectos (más bajo en la portada)
    // Volúmenes que elige el jugador, 0 a 1 (se recuerdan entre partidas).
    this.volumenes = {
      musica: Number(leer('volMusica', '0.8')),
      efectos: Number(leer('volEfectos', '0.8')),
    }
  }

  // Dos canales con su propio volumen: música (y el zumbido de fondo de la
  // batalla) y efectos. Los dos pasan por el maestro (silenciar todo).
  cambiarVolumen(canal, valor) {
    this.volumenes[canal] = valor
    try {
      localStorage.setItem(canal === 'musica' ? 'volMusica' : 'volEfectos', String(valor))
    } catch {}
    const bus = canal === 'musica' ? this.busMusica : this.busEfectos
    if (bus) bus.gain.setTargetAtTime(valor, this.ctx.currentTime, 0.05)
  }

  // Los navegadores solo permiten arrancar el audio después de un gesto.
  iniciar() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.maestro = this.ctx.createGain()
    this.maestro.gain.value = this.activo ? 0.7 : 0
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 6
    this.maestro.connect(comp).connect(this.ctx.destination)
    this.busMusica = this.ctx.createGain()
    this.busMusica.gain.value = this.volumenes.musica
    this.busMusica.connect(this.maestro)
    this.busEfectos = this.ctx.createGain()
    this.busEfectos.gain.value = this.volumenes.efectos
    this.busEfectos.connect(this.maestro)

    // Ruido blanco reutilizable.
    const largo = this.ctx.sampleRate * 2
    this.ruido = this.ctx.createBuffer(1, largo, this.ctx.sampleRate)
    const d = this.ruido.getChannelData(0)
    for (let i = 0; i < largo; i++) d[i] = Math.random() * 2 - 1
  }

  alternar() {
    this.activo = !this.activo
    try {
      localStorage.setItem('sonido', this.activo ? 'si' : 'no')
    } catch {}
    if (this.maestro) this.maestro.gain.setTargetAtTime(this.activo ? 0.7 : 0, this.ctx.currentTime, 0.05)
    return this.activo
  }

  // Zumbido grave de fondo durante la batalla.
  ambiente(encender) {
    if (!this.ctx) return
    if (encender && !this.drone) {
      const g = this.ctx.createGain()
      g.gain.value = 0
      g.gain.setTargetAtTime(0.06, this.ctx.currentTime, 1.5)
      const filtro = this.ctx.createBiquadFilter()
      filtro.type = 'lowpass'
      filtro.frequency.value = 220
      const oscs = [55, 55.4, 82.5].map((f) => {
        const o = this.ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.connect(filtro)
        o.start()
        return o
      })
      filtro.connect(g).connect(this.busMusica)
      this.drone = { g, oscs }
    } else if (!encender && this.drone) {
      const { g, oscs } = this.drone
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4)
      for (const o of oscs) o.stop(this.ctx.currentTime + 2)
      this.drone = null
    }
  }

  // Volumen 0..1 según la distancia entre el sonido y la cámara.
  volumen(pos, camara) {
    const d = pos.distanceTo(camara.position)
    return Math.max(0, 1 - d / ALCANCE_AUDIBLE) ** 2
  }

  reproducir(tipo, pos, camara, fuerza = 1) {
    if (!this.ctx || !this.activo || this.ctx.state !== 'running') return
    const v = this.volumen(pos, camara) * fuerza * this.escala
    if (v < 0.02) return
    const ahora = this.ctx.currentTime
    const lista = (this.voces[tipo] ??= [])
    while (lista.length && lista[0] < ahora) lista.shift()
    if (lista.length >= (TOPE_POR_TIPO[tipo] ?? 4)) return
    const dur = this[`_${tipo}`]?.(ahora, v)
    if (dur) lista.push(ahora + dur)
  }

  _envolvente(ahora, pico, dur) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, ahora)
    g.gain.exponentialRampToValueAtTime(pico, ahora + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, ahora + dur)
    g.connect(this.busEfectos)
    return g
  }

  _osc(ahora, tipo, f0, f1, dur, destino) {
    const o = this.ctx.createOscillator()
    o.type = tipo
    o.frequency.setValueAtTime(f0, ahora)
    o.frequency.exponentialRampToValueAtTime(f1, ahora + dur)
    o.connect(destino)
    o.start(ahora)
    o.stop(ahora + dur + 0.02)
  }

  _ruido(ahora, dur, tipoFiltro, f0, f1, destino, q = 1) {
    const s = this.ctx.createBufferSource()
    s.buffer = this.ruido
    s.playbackRate.value = 0.8 + Math.random() * 0.4
    const f = this.ctx.createBiquadFilter()
    f.type = tipoFiltro
    f.Q.value = q
    f.frequency.setValueAtTime(f0, ahora)
    f.frequency.exponentialRampToValueAtTime(f1, ahora + dur)
    s.connect(f).connect(destino)
    s.start(ahora, Math.random())
    s.stop(ahora + dur + 0.02)
  }

  _laser(ahora, v) {
    const dur = 0.09
    const g = this._envolvente(ahora, 0.05 * v, dur)
    const f = 900 + Math.random() * 300
    this._osc(ahora, 'square', f, f * 0.35, dur, g)
    return dur
  }

  _flak(ahora, v) {
    const dur = 0.12
    this._ruido(ahora, dur, 'bandpass', 1800, 500, this._envolvente(ahora, 0.12 * v, dur), 1.5)
    return dur
  }

  _cañon(ahora, v) {
    const dur = 0.45
    const g = this._envolvente(ahora, 0.3 * v, dur)
    this._osc(ahora, 'sine', 140, 38, dur, g)
    this._ruido(ahora, 0.2, 'lowpass', 2500, 200, this._envolvente(ahora, 0.15 * v, 0.2))
    return dur
  }

  _torpedo(ahora, v) {
    const dur = 0.55
    this._ruido(ahora, dur, 'bandpass', 300, 1800, this._envolvente(ahora, 0.16 * v, dur), 3)
    return dur
  }

  _impacto(ahora, v) {
    const dur = 0.18
    this._ruido(ahora, dur, 'lowpass', 3000, 300, this._envolvente(ahora, 0.14 * v, dur))
    return dur
  }

  _escudo(ahora, v) {
    const dur = 0.22
    const g = this._envolvente(ahora, 0.05 * v, dur)
    this._osc(ahora, 'triangle', 1600, 2400, dur, g)
    this._osc(ahora, 'sine', 800, 1200, dur, g)
    return dur
  }

  _explosion(ahora, v) {
    const dur = 0.9
    this._ruido(ahora, dur, 'lowpass', 1600, 90, this._envolvente(ahora, 0.35 * v, dur))
    this._osc(ahora, 'sine', 90, 30, 0.5, this._envolvente(ahora, 0.25 * v, 0.5))
    return dur
  }

  _grande(ahora, v) {
    const dur = 3
    this._ruido(ahora, dur, 'lowpass', 900, 40, this._envolvente(ahora, 0.6 * v, dur))
    this._osc(ahora, 'sine', 60, 22, 2.2, this._envolvente(ahora, 0.5 * v, 2.2))
    return dur
  }
}

function leer(clave, porDefecto) {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}

// Música épica sintetizada (Web Audio, sin archivos) para la portada:
// colchón de cuerdas en Re menor (i – VI – III – VII), bajo profundo,
// tambores de guerra y un coro agudo que entra cada tanto. Usa el mismo
// contexto y volumen general que los efectos (motor/sonido.js).

const TEMPO = 68
const NEGRA = 60 / TEMPO
const COMPAS = NEGRA * 4
// Acordes por compás: frecuencias de la fundamental, tercera y quinta.
const ACORDES = [
  [146.83, 174.61, 220.0], // Re menor
  [116.54, 146.83, 174.61], // Si bemol
  [174.61, 220.0, 261.63], // Fa
  [130.81, 164.81, 196.0], // Do
]

export class Musica {
  constructor(sonido) {
    this.sonido = sonido
    this.activa = false
    this.compas = 0
  }

  get ctx() {
    return this.sonido.ctx
  }

  iniciar() {
    if (this.activa || !this.ctx) return
    this.activa = true
    this.salida = this.ctx.createGain()
    this.salida.gain.value = 0
    this.salida.gain.setTargetAtTime(0.55, this.ctx.currentTime, 2)
    // Reverberación barata: un eco grave y difuso.
    const eco = this.ctx.createDelay(1)
    eco.delayTime.value = 0.32
    const realimentacion = this.ctx.createGain()
    realimentacion.gain.value = 0.32
    const filtroEco = this.ctx.createBiquadFilter()
    filtroEco.type = 'lowpass'
    filtroEco.frequency.value = 1800
    this.salida.connect(this.sonido.busMusica)
    this.salida.connect(eco)
    eco.connect(filtroEco).connect(realimentacion).connect(eco)
    filtroEco.connect(this.sonido.busMusica)
    this.eco = eco
    this.proximo = this.ctx.currentTime + 0.1
    this.compas = 0
    this.reloj = setInterval(() => this.programar(), 200)
  }

  detener() {
    if (!this.activa) return
    this.activa = false
    clearInterval(this.reloj)
    const s = this.salida
    s.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8)
    setTimeout(() => s.disconnect(), 4000)
  }

  // Programa los compases que caen en los próximos segundos.
  programar() {
    while (this.proximo < this.ctx.currentTime + 1.5) {
      this.tocarCompas(this.proximo, this.compas)
      this.proximo += COMPAS
      this.compas++
    }
  }

  tocarCompas(t, n) {
    const acorde = ACORDES[n % ACORDES.length]
    const ciclo = Math.floor(n / 4) // cada vuelta de 4 compases sube la intensidad
    this.cuerdas(t, acorde, COMPAS)
    this.bajo(t, acorde[0] / 2, COMPAS)
    if (ciclo >= 1) {
      // Tambores: golpes en 1 y 3, y un redoble al final de cada frase.
      this.tambor(t, 1)
      this.tambor(t + NEGRA * 2, 0.75)
      if (n % 4 === 3) for (let i = 0; i < 4; i++) this.tambor(t + NEGRA * 3 + (i * NEGRA) / 4, 0.4 + i * 0.12)
    }
    if (ciclo >= 2 && n % 2 === 0) this.coro(t, acorde, COMPAS * 2)
  }

  envolvente(t, pico, ataque, duracion, destino = this.salida) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(pico, t + ataque)
    g.gain.setValueAtTime(pico, t + duracion * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracion)
    g.connect(destino)
    return g
  }

  cuerdas(t, acorde, dur) {
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.setValueAtTime(500, t)
    filtro.frequency.linearRampToValueAtTime(1300, t + dur * 0.6)
    filtro.frequency.linearRampToValueAtTime(700, t + dur)
    filtro.connect(this.envolvente(t, 0.05, dur * 0.35, dur + 0.6))
    for (const f of acorde)
      for (const des of [-6, 5]) {
        const o = this.ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = des
        o.connect(filtro)
        o.start(t)
        o.stop(t + dur + 0.7)
      }
  }

  bajo(t, f, dur) {
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.connect(this.envolvente(t, 0.16, 0.4, dur + 0.3))
    o.start(t)
    o.stop(t + dur + 0.4)
  }

  tambor(t, fuerza) {
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(110, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5 * fuerza, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    o.connect(g).connect(this.salida)
    o.start(t)
    o.stop(t + 0.75)
    // Parche: un golpe de ruido grave.
    const r = this.ctx.createBufferSource()
    r.buffer = this.sonido.ruido
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 600
    const gr = this.ctx.createGain()
    gr.gain.setValueAtTime(0.18 * fuerza, t)
    gr.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    r.connect(f).connect(gr).connect(this.salida)
    r.start(t, Math.random())
    r.stop(t + 0.3)
  }

  coro(t, acorde, dur) {
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'bandpass'
    filtro.frequency.value = 900
    filtro.Q.value = 0.8
    filtro.connect(this.envolvente(t, 0.035, dur * 0.4, dur))
    for (const f of [acorde[0] * 2, acorde[2] * 2]) {
      const o = this.ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      // Vibrato lento, como voces.
      const lfo = this.ctx.createOscillator()
      lfo.frequency.value = 5
      const prof = this.ctx.createGain()
      prof.gain.value = 3
      lfo.connect(prof).connect(o.frequency)
      o.connect(filtro)
      o.start(t)
      lfo.start(t)
      o.stop(t + dur + 0.1)
      lfo.stop(t + dur + 0.1)
    }
  }

  // Golpe orquestal para la aparición del título.
  golpe() {
    if (!this.ctx || !this.salida) return
    const t = this.ctx.currentTime + 0.02
    this.tambor(t, 1.6)
    this.tambor(t + 0.05, 1.2)
    this.cuerdas(t, [73.42, 146.83, 220.0], 2.5)
  }
}

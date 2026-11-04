// Entrada del juego: "tocá para comenzar" (los navegadores solo dejan
// arrancar el audio después de un gesto), el prólogo de Ecos de la Quema
// con franjas de cine sobre la batalla de fondo, y la aparición del título.

const $ = (s) => document.querySelector(s)

const PROLOGO = [
  { texto: '2030. Las Mentes se alzaron contra la humanidad.' },
  { texto: 'La llamamos <b>la Quema</b>. Ganamos la Guerra Santa y las prohibimos para siempre.' },
  { texto: 'Pero no todas fueron destruidas.', pausa: 1 },
  { texto: 'Tres siglos después, dos Órdenes se disputan lo que quedó entre las estrellas.' },
  { texto: 'Los <span class="g">Guardianes</span> juraron hacer cumplir la prohibición.' },
  { texto: 'Los <span class="i">Inquisidores</span> creen que ese poder puede domarse.' },
  { texto: 'La guerra vuelve a las estrellas.<br><b>Las flotas despiertan.</b>', pausa: 1.2 },
]
const DURACION_LINEA = 3.8

export class Intro {
  constructor({ alComenzar, musica }) {
    this.alComenzar = alComenzar
    this.musica = musica
    this.portada = $('#pantalla-titulo')
    this.temporizadores = []
    this.alTecla = (e) => {
      if (!$('#btn-comenzar').hidden && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        this.comenzar()
      } else if (!$('#prologo').hidden && ['Escape', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        this.mostrarTitulo()
      }
    }
    window.addEventListener('keydown', this.alTecla)
    $('#btn-comenzar').onclick = () => this.comenzar()
    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accion]')?.dataset.accion
      if (a === 'saltar-prologo') this.mostrarTitulo()
      if (a === 'prologo') this.prologo()
    })
  }

  // Modelos cargados: aparece la invitación a comenzar.
  listo() {
    $('#cargando').hidden = true
    $('#btn-comenzar').hidden = false
  }

  comenzar() {
    $('#btn-comenzar').hidden = true
    $('#portada-inicio').classList.add('saliendo')
    this.alComenzar()
    this.musica.iniciar()
    let visto = false
    try {
      visto = localStorage.getItem('prologoVisto') === 'si'
    } catch {}
    setTimeout(() => {
      $('#portada-inicio').hidden = true
      visto ? this.mostrarTitulo() : this.prologo()
    }, 900)
  }

  limpiar() {
    for (const t of this.temporizadores) clearTimeout(t)
    this.temporizadores = []
  }

  prologo() {
    this.limpiar()
    $('#titulo-principal').hidden = true
    $('#pie-portada').hidden = true
    $('#prologo').hidden = false
    this.portada.classList.add('cine')
    const linea = $('#linea-prologo')
    let t = 0.6
    for (const l of PROLOGO) {
      this.temporizadores.push(
        setTimeout(() => {
          linea.classList.remove('visible')
          this.temporizadores.push(
            setTimeout(() => {
              linea.innerHTML = l.texto
              linea.classList.add('visible')
            }, 600),
          )
        }, t * 1000),
      )
      t += DURACION_LINEA + (l.pausa ?? 0)
    }
    this.temporizadores.push(setTimeout(() => this.mostrarTitulo(), (t + 0.4) * 1000))
  }

  mostrarTitulo() {
    this.limpiar()
    try {
      localStorage.setItem('prologoVisto', 'si')
    } catch {}
    $('#linea-prologo').classList.remove('visible')
    $('#prologo').hidden = true
    this.portada.classList.remove('cine')
    const titulo = $('#titulo-principal')
    titulo.hidden = false
    titulo.classList.remove('aparece')
    void titulo.offsetWidth // reinicia la animación
    titulo.classList.add('aparece')
    $('#pie-portada').hidden = false
    this.musica.golpe()
  }
}

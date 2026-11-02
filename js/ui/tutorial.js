// Tutorial de la primera batalla: un panel con pasos cortos que avanzan solos
// cuando el jugador hace lo que se pide (o con "Siguiente"). El enemigo
// espera quieto hasta el paso de atacar.

import { ES_TACTIL } from '../tactil.js'

const $ = (s) => document.querySelector(s)

const PASOS = [
  {
    titulo: 'Bienvenido, comandante',
    texto: 'Esta es tu flota. En un minuto te muestro lo básico. El enemigo espera hasta que terminemos.',
    boton: 'Empezar',
  },
  {
    titulo: 'Mover la cámara',
    texto: 'Deslizá <b>con dos dedos</b> en el touchpad para girar alrededor de la flota y <b>pellizcá</b> para acercarte o alejarte.',
    textoTactil: '<b>Arrastrá con un dedo</b> para girar alrededor de la flota y <b>pellizcá</b> con dos dedos para acercarte o alejarte.',
    hecho: (t) => t.giro > 0.6 && t.zoom > 0.25,
  },
  {
    titulo: 'Elegir batallones',
    texto: '<b>Tocá</b> una nave para seleccionar su batallón, o <b>mantené apretado y arrastrá</b> para encerrar varios en un recuadro.',
    textoTactil: '<b>Tocá</b> una nave tuya para seleccionar su batallón. <b>Doble toque</b> elige todos los de ese tipo y <b>mantener apretado</b> suma otro batallón.',
    hecho: (t) => t.eventos.has('seleccion'),
  },
  {
    titulo: 'Dar órdenes',
    texto: 'Con algo seleccionado, hacé <b>clic con dos dedos</b> en el espacio vacío: tus naves van ahí.',
    textoTactil: 'Con algo seleccionado, <b>tocá el espacio vacío</b>: tus naves van ahí.',
    hecho: (t) => t.eventos.has('mover'),
  },
  {
    titulo: 'Moverse en 3D',
    texto: 'Apretá <b>M</b>: aparece el disco de movimiento. Elegí el lugar con el cursor, mantené <b>Shift</b> para subir o bajar y hacé <b>clic</b> para confirmar.',
    textoTactil: 'Tocá el botón <b>Mover</b>: aparece el disco. Con <b>▲ ▼</b> subís o bajás, y después <b>tocá el destino</b>.',
    hecho: (t) => t.eventos.has('mover3d'),
  },
  {
    titulo: 'Atacar',
    texto: 'Hacé <b>clic con dos dedos sobre una nave enemiga</b> (las rojas) para atacarla. A partir de ahora el enemigo también se mueve.',
    textoTactil: 'Con algo seleccionado, <b>tocá una nave enemiga</b> (las rojas) para atacarla. A partir de ahora el enemigo también se mueve.',
    alEntrar: (t) => t.soltarIA(),
    hecho: (t) => t.eventos.has('atacar'),
  },
  {
    titulo: 'El tiempo es tuyo',
    texto: '<b>P</b> congela la batalla y te deja seguir dando órdenes (pausa táctica). <b>R</b> alterna la velocidad ×2. Tocá el <b>minimapa</b> para llevar la cámara a otro lugar.',
    textoTactil: 'El botón <b>❚❚ Pausa</b> congela la batalla y te deja seguir dando órdenes. <b>×1</b> alterna la velocidad ×2. Tocá el <b>minimapa</b> para llevar la cámara a otro lugar.',
    hecho: (t) => t.eventos.has('pausaTactica'),
  },
  {
    titulo: 'Contras y terreno',
    texto: 'Corbeta › Caza › Bombardero › Crucero y Acorazado; el Crucero barre Corbetas y Cazas. Los asteroides frenan los disparos (los chicos se rompen) y las nebulosas esconden naves. Tus naves chicas dañadas se reparan cerca de tus capitales. <b>Esc</b> muestra todos los controles.',
    textoTactil:
      'Corbeta › Caza › Bombardero › Crucero y Acorazado; el Crucero barre Corbetas y Cazas. Los asteroides frenan los disparos (los chicos se rompen) y las nebulosas esconden naves. Tus naves chicas dañadas se reparan cerca de tus capitales. El botón <b>Menú</b> muestra todos los controles.',
    boton: 'A la batalla',
  },
]

export class Tutorial {
  constructor({ orbital, ia }) {
    this.orbital = orbital
    this.ia = ia
    this.eventos = new Set()
    this.i = -1
    this.espera = 0
    this.panel = $('#tutorial')
    this.panel.hidden = false
    this.alClic = (e) => {
      const a = e.target.closest('[data-tutorial]')?.dataset.tutorial
      if (a === 'siguiente') this.siguiente()
      if (a === 'saltar') this.terminar()
    }
    this.panel.addEventListener('click', this.alClic)
    ia.esperando = true
    this.siguiente()
  }

  get giro() {
    return Math.abs(this.orbital.yaw - this.inicio.yaw) + Math.abs(this.orbital.pitch - this.inicio.pitch)
  }

  get zoom() {
    return Math.abs(Math.log(this.orbital.distDeseada / this.inicio.dist))
  }

  notificar(evento) {
    this.eventos.add(evento)
  }

  soltarIA() {
    this.ia.esperando = false
  }

  siguiente() {
    this.i++
    if (this.i >= PASOS.length) return this.terminar()
    const p = PASOS[this.i]
    this.eventos.clear()
    this.inicio = { yaw: this.orbital.yaw, pitch: this.orbital.pitch, dist: this.orbital.distDeseada }
    this.espera = 0
    p.alEntrar?.(this)
    this.panel.innerHTML = `
      <div class="tutorial-paso">Paso ${this.i + 1} de ${PASOS.length}</div>
      <h3>${p.titulo}</h3>
      <p>${(ES_TACTIL && p.textoTactil) || p.texto}</p>
      <div class="tutorial-botones">
        <button class="btn ${p.boton ? 'grande' : 'chico'}" data-tutorial="siguiente">${p.boton ?? 'Siguiente'}</button>
        ${this.i < PASOS.length - 1 ? '<button class="btn chico" data-tutorial="saltar">Saltar tutorial</button>' : ''}
      </div>`
  }

  // Llamado cada cuadro: cuando el paso se cumple, avanza solo tras una pausa breve.
  actualizar(dt) {
    if (this.i < 0 || this.i >= PASOS.length) return
    const p = PASOS[this.i]
    if (!p.hecho) return
    if (this.espera > 0) {
      this.espera -= dt
      if (this.espera <= 0) this.siguiente()
    } else if (p.hecho(this)) {
      this.espera = 0.9
      this.panel.classList.add('logrado')
      setTimeout(() => this.panel.classList.remove('logrado'), 800)
    }
  }

  terminar() {
    this.soltarIA()
    this.panel.hidden = true
    this.panel.removeEventListener('click', this.alClic)
    this.i = PASOS.length
    try {
      localStorage.setItem('tutorialVisto', 'si')
    } catch {}
  }

  destruir() {
    if (this.i < PASOS.length) {
      this.panel.hidden = true
      this.panel.removeEventListener('click', this.alClic)
    }
  }
}

export function tutorialVisto() {
  try {
    return localStorage.getItem('tutorialVisto') === 'si'
  } catch {
    return true
  }
}

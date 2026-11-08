// Guía rápida de controles antes de la batalla rápida: cómo moverse por el
// mapa y dar órdenes, según el aparato (táctil o mouse y touchpad). Se puede
// pedir que no vuelva a aparecer.
import { ES_TACTIL } from '../tactil.js'

const $ = (s) => document.querySelector(s)
const CLAVE = 'guiaControlesVista'

const TACTIL = [
  ['☝', 'Moverte por el mapa', 'Arrastrá con un dedo.'],
  ['🤏', 'Acercar y alejar', 'Pellizcá con dos dedos.'],
  ['↻', 'Rotar e inclinar', 'Girá dos dedos o deslizalos de costado. Arriba o abajo: inclinar.'],
  ['◉', 'Elegir naves', 'Tocá una nave tuya. <b>Todos</b> elige la flota entera.'],
  ['➜', 'Dar órdenes', 'Con naves elegidas, tocá el espacio para ir o un enemigo para atacar.'],
  ['▦', 'Minimapa', 'Tocalo para saltar a esa parte del mapa.'],
]

const MOUSE = [
  ['🖱', 'Elegir naves', 'Clic en una nave tuya, o arrastrá un recuadro.'],
  ['➜', 'Dar órdenes', 'Clic derecho en el espacio para ir, o en un enemigo para atacar.'],
  ['↻', 'Girar la cámara', 'Arrastrá con el clic derecho apretado.'],
  ['✥', 'Moverte por el mapa', 'Arrastrá con la rueda apretada, usá las flechas o hacé doble clic en el espacio.'],
  ['⊕', 'Zoom', 'Rueda del mouse.'],
]

const TOUCHPAD = [
  ['☝', 'Elegir y ordenar', 'Clic para elegir. Clic con dos dedos para ir o atacar.'],
  ['↻', 'Girar', 'Deslizá dos dedos.'],
  ['✥', 'Moverte', 'Shift + deslizar dos dedos, o las flechas.'],
  ['🤏', 'Zoom', 'Pellizcá.'],
]

const tarjetas = (lista) =>
  lista.map(([icono, titulo, texto]) => `<div class="guia-tarjeta"><i>${icono}</i><b>${titulo}</b><span>${texto}</span></div>`).join('')

export function mostrarGuia(alSeguir) {
  let vista = false
  try {
    vista = localStorage.getItem(CLAVE) === 'si'
  } catch {}
  if (vista) return alSeguir()
  $('#guia-contenido').innerHTML = ES_TACTIL
    ? `<div class="guia-grilla">${tarjetas(TACTIL)}</div>`
    : `<div class="fila-titulo">Mouse</div><div class="guia-grilla">${tarjetas(MOUSE)}</div>
       <div class="fila-titulo">Touchpad</div><div class="guia-grilla">${tarjetas(TOUCHPAD)}</div>
       <p class="nota">Teclado: <b>M</b> mover en 3D · <b>A</b> atacar · <b>F</b> seguir la selección · <b>Espacio</b> vista táctica · <b>P</b> pausa táctica · <b>Esc</b> todos los controles.</p>`
  const pantalla = $('#pantalla-guia')
  pantalla.classList.add('visible')
  $('#guia-seguir').onclick = () => {
    if ($('#guia-no-mostrar').checked)
      try {
        localStorage.setItem(CLAVE, 'si')
      } catch {}
    pantalla.classList.remove('visible')
    alSeguir()
  }
}

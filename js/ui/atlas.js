// Atlas de naves: cada nave con su modelo girando, sus números reales, cómo
// usarla y contra qué. Los Autómatas y las piezas de la campaña aparecen
// recién cuando los descubrís jugándola. El visor usa su propio renderer y
// solo dibuja mientras la pantalla está abierta.
import * as THREE from 'three'
import { FACCIONES, FORMACIONES, ORDEN_TIPOS, TIPOS, multiplicadorDaño, puedeFormar } from '../datos.js'
import { plantilla, crearMallaNave } from '../motor/modelos.js'
import { mostrarPantalla } from './menus.js'

const $ = (s) => document.querySelector(s)

const ESTRATEGIA = {
  caza: 'Mantenelos sobre tus capitales y soltalos cuando aparezcan Bombarderos. En Tijera se sacan de encima a quien los persigue; en Cuña llegan todos juntos.',
  corbeta: 'Son la respuesta a los enjambres de Cazas: orbitan al blanco y son difíciles de acertar. Alejalas del flak de los Cruceros.',
  bombardero: 'Mandalos contra capitales y nunca solos: sin escolta, los Cazas los bajan antes de que disparen. Apenas le aciertan a naves chicas.',
  crucero: 'Es el escudo de la flota: sus torretas limpian lo chico que se acerca. Ponelo entre tus capitales y el enjambre, y cuidalo de los Bombarderos.',
  portanaves: 'Quedate atrás y dejá que su escuadrilla trabaje: repone bajas hasta agotar el hangar. Casi no se defiende, así que necesita escolta.',
  acorazado: 'Abrí el combate a distancia: sus cañones llegan más lejos que todo. Lento para girar: un buen rival lo rodea, y los Bombarderos son su miedo.',
  carguero: 'No pelea. Si es tuyo, rodealo con la flota y no te separes. Si es del rival, los Bombarderos lo abren rápido.',
  derelicto: 'Un casco a la deriva. Lo que importa es lo que lleva adentro.',
  estacion: 'Sus torretas castigan a lo chico. Para tomarla, primero sacale la escolta y después mandá Bombarderos.',
  laboratorio: 'Blindado y con flak por todos lados. Se cae con Bombarderos bien cubiertos, no con Cazas.',
  repetidor: 'Mientras uno siga en pie, la Mente es intocable y fabrica autómatas. Son los primeros blancos.',
  mente: 'Sobrevivió a la Quema. Sin repetidores queda expuesta: ahí se decide todo.',
}

const MODELOS = {
  'hgn-interceptor': 'Hiigaran Interceptor, de MrHohenheim',
  'hgn-gunship': 'Hiigaran Pulsar Gunship, de MrHohenheim',
  'hgn-bomber': 'Hiigaran Attack Bomber, de MrHohenheim',
  'hgn-destroyer': 'Hiigaran Destroyer, de MrHohenheim',
  'hgn-carrier': 'Hiigaran Carrier, de MrHohenheim',
  'hgn-battlecruiser': 'Hiigaran Battlecruiser, de MrHohenheim',
  'vgr-lance': 'Vaygr Lance Fighter, de MrHohenheim',
  'vgr-corvette': 'Vaygr Laser Corvette, de MrHohenheim',
  'vgr-bomber': 'Vaygr Bomber, de MrHohenheim',
  'vgr-destroyer': 'Vaygr Destroyer, de MrHohenheim',
  'vgr-carrier': 'Vaygr Carrier, de MrHohenheim',
  'vgr-battlecruiser': 'Vaygr Battlecruiser, de MrHohenheim',
  'rylek-skiff': 'Fighter class Skiff, de Gwyvern',
  'rylek-galley': 'Scavenger Class Galley, de Gwyvern',
  'rylek-brig': 'Laboror Class Brig, de Gwyvern',
  'rylek-galleon': 'Predator class galleon, de Gwyvern',
  'rlab-ranger': 'Space Ranger SR1, de Rakshaan',
  'rlab-fragata': 'Assault Frigate, de Rakshaan',
  'rlab-skycruiser': 'Sky Cruiser, de Rakshaan',
}
const ARMAS = { laser: 'Láser', torpedo: 'Torpedo', flak: 'Flak', cañon: 'Cañón' }

// Pestañas. `desde`: escenarios ganados para verlo (en cualquiera de las Órdenes).
const combate = (faccion, desde = 0) => ORDEN_TIPOS.map((tipo) => ({ tipo, faccion, desde }))
const PESTAÑAS = [
  { clave: 'guardianes', nombre: 'Guardianes', lista: combate('guardianes') },
  { clave: 'inquisidores', nombre: 'Inquisidores', lista: combate('inquisidores') },
  { clave: 'automatas', nombre: 'Autómatas', lista: combate('automatas', 4) },
  {
    clave: 'piezas',
    nombre: 'Campaña',
    lista: [
      { tipo: 'derelicto', faccion: 'guardianes', desde: 1 },
      { tipo: 'estacion', faccion: 'guardianes', desde: 2 },
      { tipo: 'carguero', faccion: 'inquisidores', desde: 3 },
      { tipo: 'laboratorio', faccion: 'inquisidores', desde: 4 },
      { tipo: 'repetidor', faccion: 'automatas', desde: 5 },
      { tipo: 'mente', faccion: 'automatas', desde: 5 },
    ],
  },
]

// Números reales de la nave con el rasgo de su facción, sumando todo el batallón no.
function ficha(tipo, faccion) {
  const t = TIPOS[tipo]
  const r = FACCIONES[faccion].rasgo ?? {}
  const dps = t.armas.reduce((s, a) => s + a.daño / a.cadencia, 0) * (r.daño ?? 1)
  return {
    escudo: Math.round(t.escudoMax * (r.escudo ?? 1)),
    estructura: t.estructuraMax,
    velocidad: Math.round(t.velocidad * (r.velocidad ?? 1)),
    dps: Math.round(dps),
    alcance: t.armas.length ? Math.max(...t.armas.map((a) => a.alcance)) : 0,
  }
}

// Topes de las barras: lo mejor de las naves de combate.
const TOPES = (() => {
  const f = ORDEN_TIPOS.map((k) => ficha(k, 'guardianes'))
  const tope = (c) => Math.max(...f.map((x) => x[c])) * 1.15
  return { escudo: tope('escudo'), estructura: tope('estructura'), velocidad: tope('velocidad'), dps: tope('dps'), alcance: tope('alcance') }
})()

function barra(nombre, valor, tope) {
  return `<div class="atlas-barra"><span>${nombre}</span><i><b style="width:${Math.min(100, (valor / tope) * 100)}%"></b></i><em>${valor.toLocaleString('es-AR')}</em></div>`
}

export class Atlas {
  // descubierto(): escenarios ganados en la Orden que más avanzó.
  constructor({ descubierto }) {
    this.descubierto = descubierto
    this.pestaña = PESTAÑAS[0]
    this.elegido = 0
    this.yaw = 0.7
    this.pitch = 0.3
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-accion]')
      const a = el?.dataset.accion
      if (a === 'atlas') this.abrir()
      else if (a === 'atlas-pestaña') this.cambiarPestaña(el.dataset.clave)
      else if (a === 'atlas-nave') this.elegir(Number(el.dataset.i))
    })
  }

  abrir() {
    mostrarPantalla('pantalla-atlas')
    this.prepararVisor()
    this.cambiarPestaña(this.pestaña.clave)
    this.redimensionar()
    if (!this.corriendo) {
      this.corriendo = true
      this.ultimo = performance.now()
      requestAnimationFrame((t) => this.cuadro(t))
    }
  }

  prepararVisor() {
    if (this.renderer) return
    const lienzo = $('#atlas-visor')
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.escena = new THREE.Scene()
    this.camara = new THREE.PerspectiveCamera(32, 1, 0.5, 5000)
    const sol = new THREE.DirectionalLight(0xfff0dc, 3)
    sol.position.set(-1, 1.2, 1)
    this.escena.add(sol)
    const contra = new THREE.DirectionalLight(0x8fb4ff, 1.6)
    contra.position.set(1, -0.2, -1)
    this.escena.add(contra)
    this.escena.add(new THREE.HemisphereLight(0x9fb8e0, 0x2a2018, 1.3))
    // Arrastrar gira la nave.
    let antes = null
    lienzo.addEventListener('pointerdown', (e) => {
      antes = { x: e.clientX, y: e.clientY }
      this.quieto = 3
      lienzo.setPointerCapture(e.pointerId)
    })
    lienzo.addEventListener('pointermove', (e) => {
      if (!antes) return
      this.yaw += (e.clientX - antes.x) * 0.01
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - antes.y) * 0.008, -1.3, 1.3)
      antes = { x: e.clientX, y: e.clientY }
      this.quieto = 3
    })
    lienzo.addEventListener('pointerup', () => (antes = null))
    lienzo.addEventListener('pointercancel', () => (antes = null))
    window.addEventListener('resize', () => this.redimensionar())
  }

  redimensionar() {
    const el = $('#atlas-visor')?.parentElement
    if (!this.renderer || !el?.clientWidth) return
    this.renderer.setSize(el.clientWidth, el.clientHeight, false)
    this.camara.aspect = el.clientWidth / el.clientHeight
    this.camara.updateProjectionMatrix()
    this.encuadrar()
  }

  // La nave entera a la vista, sea el visor ancho o angosto.
  encuadrar() {
    if (!this.radio) return
    const c = this.camara
    const media = Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * Math.min(1, c.aspect)
    c.position.set(0, 0, (this.radio * 1.12) / media)
    c.lookAt(0, 0, 0)
  }

  cuadro(t) {
    // Se apaga solo al salir de la pantalla.
    if (!$('#pantalla-atlas').classList.contains('visible')) {
      this.corriendo = false
      return
    }
    requestAnimationFrame((x) => this.cuadro(x))
    const dt = Math.min((t - this.ultimo) / 1000, 0.1)
    this.ultimo = t
    this.quieto = Math.max(0, (this.quieto ?? 0) - dt)
    if (!this.quieto) this.yaw += dt * 0.35
    if (this.malla) this.malla.rotation.set(this.pitch, this.yaw, 0, 'XYZ')
    this.renderer.render(this.escena, this.camara)
  }

  cambiarPestaña(clave) {
    this.pestaña = PESTAÑAS.find((p) => p.clave === clave)
    const f = FACCIONES[clave]
    if (f && !f.soloCampana) document.documentElement.style.setProperty('--acento', f.acentoCss)
    $('#atlas-pestañas').innerHTML = PESTAÑAS.map((p) => {
      const oculta = p.lista.every((x) => x.desde > this.descubierto())
      return `<button class="btn chico ${p === this.pestaña ? 'activo' : ''}" data-accion="atlas-pestaña" data-clave="${p.clave}" ${oculta ? 'disabled' : ''}>${oculta ? '???' : p.nombre}</button>`
    }).join('')
    this.elegir(0)
  }

  elegir(i) {
    const lista = this.pestaña.lista
    const visto = (x) => x.desde <= this.descubierto()
    if (!visto(lista[i])) return
    this.elegido = i
    $('#atlas-lista').innerHTML = lista
      .map((x, k) => `<button class="atlas-item ${k === i ? 'elegido' : ''}" data-accion="atlas-nave" data-i="${k}" ${visto(x) ? '' : 'disabled'}><small>Nº ${String(k + 1).padStart(2, '0')}</small>${visto(x) ? TIPOS[x.tipo].nombre : '???'}</button>`)
      .join('')
    this.mostrar(lista[i])
  }

  mostrar({ tipo, faccion }) {
    if (this.malla) this.escena.remove(this.malla)
    this.malla = crearMallaNave(faccion, tipo)
    this.escena.add(this.malla)
    this.radio = plantilla(faccion, tipo).radio
    this.encuadrar()

    const t = TIPOS[tipo]
    const f = FACCIONES[faccion]
    const n = ficha(tipo, faccion)
    const combateNave = ORDEN_TIPOS.includes(tipo)
    const nombres = (l) => l.map((k) => TIPOS[k].nombre).join(', ') || '—'
    const fuertes = ORDEN_TIPOS.filter((k) => k !== tipo && multiplicadorDaño(t.hangar?.tipo ?? tipo, k) > (t.ventajaGeneral ?? 1))
    const debiles = ORDEN_TIPOS.filter((k) => k !== tipo && TIPOS[k].ventaja?.[tipo])
    const armas = Object.entries(t.armas.reduce((m, a) => ({ ...m, [a.tipo]: (m[a.tipo] ?? 0) + 1 }), {}))
      .map(([k, c]) => `${c > 1 ? `${c}× ` : ''}${ARMAS[k]}`)
      .join(' · ')
    const modelo = MODELOS[f.modelos[tipo]]
    $('#atlas-ficha').innerHTML = `
      <div class="fila-titulo">${f.nombre}${combateNave ? ` · ${t.clase === 'capital' ? 'Nave capital' : `Batallón de ${t.porBatallon}`} · ${t.costo} pts` : ''}</div>
      <h3>${t.nombre}</h3>
      ${t.rol ? `<p>${t.rol}</p>` : ''}
      ${barra('Escudo', n.escudo, TOPES.escudo)}
      ${barra('Estructura', n.estructura, TOPES.estructura)}
      ${barra('Daño por seg.', n.dps, TOPES.dps)}
      ${barra('Alcance', n.alcance, TOPES.alcance)}
      ${barra('Velocidad', n.velocidad, TOPES.velocidad)}
      ${armas ? `<div class="atlas-dato"><span>Armas</span>${armas}</div>` : ''}
      ${t.hangar ? `<div class="atlas-dato"><span>Hangar</span>${t.hangar.reserva} Cazas, hasta ${t.hangar.capacidad} a la vez</div>` : ''}
      ${combateNave ? `<div class="atlas-dato"><span class="fuerte">Fuerte contra</span>${t.ventajaGeneral ? 'Todo (+25% de daño)' : nombres(fuertes)}${t.hangar ? ' (con sus Cazas)' : ''}</div>
      <div class="atlas-dato"><span class="debil">Débil contra</span>${nombres(debiles)}</div>
      <div class="atlas-dato"><span>Formaciones</span>${Object.keys(FORMACIONES).filter((k) => puedeFormar(tipo, k)).map((k) => FORMACIONES[k].nombre).join(', ')}</div>` : ''}
      <div class="fila-titulo">Cómo usarla</div>
      <p>${ESTRATEGIA[tipo]}</p>
      ${modelo ? `<p class="nota">Modelo: ${modelo}</p>` : ''}`
  }
}

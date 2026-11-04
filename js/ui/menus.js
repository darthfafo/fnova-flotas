// Pantallas fuera de la batalla: título, facción, armado de flota y fin.
import { FACCIONES, TIPOS, ORDEN_TIPOS, DIFICULTADES, PRESUPUESTO_BASE, PRESUPUESTOS, PRESUPUESTO_MIN, PRESUPUESTO_MAX } from '../datos.js'
import { MAPAS } from '../sim/terreno.js'
import { ES_TACTIL } from '../tactil.js'

const $ = (s) => document.querySelector(s)

export function mostrarPantalla(id) {
  for (const p of document.querySelectorAll('.pantalla:not(.superpuesta)')) p.classList.toggle('visible', p.id === id)
}

export class Menus {
  // faccionFija: devuelve la facción del comandante con sesión iniciada (o null).
  constructor({ alCombatir, alAbrirAyuda, alTutorial, faccionFija = () => null }) {
    this.faccionFija = faccionFija
    this.modo = 'normal' // 'normal' (tu comandante) o 'rapida' (cualquier facción, sin armar flota)
    this.config = {
      faccion: 'guardianes',
      dificultad: 'normal',
      calidad: guardado('calidad', ES_TACTIL ? 'baja' : 'alta'),
      presupuesto: limitar(Number(guardado('presupuesto', PRESUPUESTO_BASE)) || PRESUPUESTO_BASE),
      flota: { caza: 3, corbeta: 2, bombardero: 2, crucero: 2, portanaves: 0, acorazado: 0 },
      mapa: guardado('mapa', 'mixto'),
    }
    this.alCombatir = alCombatir
    this.armarFacciones()
    this.armarFlota()
    this.sugerida()

    document.body.addEventListener('click', (e) => {
      const a = e.target.closest('[data-accion]')?.dataset.accion
      if (!a) return
      if (a === 'nueva') this.rapida()
      else if (a === 'armar-flota') this.jugar()
      else if (a === 'tutorial') alTutorial()
      else if (a === 'controles') alAbrirAyuda(false)
      else if (a === 'volver-titulo' || a === 'menu') mostrarPantalla('pantalla-titulo')
      else if (a === 'volver-faccion' && this.modo === 'multi') this.alSalirMulti?.()
      else if (a === 'volver-faccion') this.faccionFija() ? mostrarPantalla('pantalla-titulo') : mostrarPantalla('pantalla-faccion')
      else if (a === 'cambiar-flota') mostrarPantalla('pantalla-flota')
      else if (a === 'sugerida') {
        this.sugerida()
      } else if (a === 'combatir' && this.modo === 'multi') this.alListo?.(this.config)
      else if (a === 'combatir' || a === 'revancha') this.alCombatir(this.config)
    })
  }

  // "Jugar": batalla rápida con cualquier facción, flota sugerida y mapa al azar.
  rapida() {
    this.modo = 'rapida'
    $('#faccion-aviso').innerHTML = '<b>Batalla rápida:</b> elegí tu Orden y entrás directo a la batalla con una flota sugerida.'
    $('#btn-armar-flota').hidden = false
    mostrarPantalla('pantalla-faccion')
  }

  // Armar la flota a mano: con sesión iniciada se juega con la facción del
  // comandante; sin sesión se elige facción.
  jugar() {
    this.modo = 'normal'
    $('#btn-armar-flota').hidden = true
    const fija = this.faccionFija()
    if (fija) {
      this.config.faccion = fija
      document.documentElement.style.setProperty('--acento', FACCIONES[fija].acentoCss)
      this.refrescarFlota()
      return mostrarPantalla('pantalla-flota')
    }
    $('#faccion-aviso').innerHTML = 'Sin sesión iniciada podés jugar con cualquier facción. <b>Creá un comandante</b> para entrar al Salón de la Fama.'
    mostrarPantalla('pantalla-faccion')
  }

  cargaLista() {
    $('#cargando').hidden = true
    $('#botones-titulo').hidden = false
  }

  progreso(f) {
    $('#carga-barra').style.width = `${Math.round(f * 100)}%`
  }

  armarFacciones() {
    const lista = $('#lista-facciones')
    lista.innerHTML = ''
    for (const f of Object.values(FACCIONES).filter((x) => !x.soloCampana)) {
      const t = document.createElement('div')
      t.className = 'tarjeta-faccion'
      t.style.setProperty('--color', f.acentoCss)
      t.innerHTML = `
        <div class="imagen" style="background-image:url('${f.imagen}')"></div>
        <div class="cuerpo">
          <h3>${f.nombre}</h3>
          <div class="lema">${f.lema}</div>
          <p>${f.descripcion}</p>
          ${bloqueRasgo(f)}
        </div>`
      t.addEventListener('click', () => {
        this.config.faccion = f.clave
        document.documentElement.style.setProperty('--acento', f.acentoCss)
        if (this.modo === 'rapida') {
          // Partida rápida: flota sugerida, mapa al azar y a pelear.
          this.sugerida()
          return this.alCombatir({ ...this.config, mapa: 'azar' })
        }
        this.refrescarFlota()
        mostrarPantalla('pantalla-flota')
      })
      lista.appendChild(t)
    }
  }

  armarFlota() {
    const lista = $('#lista-tipos')
    lista.innerHTML = ''
    for (const clave of ORDEN_TIPOS) {
      const t = TIPOS[clave]
      // Contras derivadas de las tablas de ventaja (nada escrito a mano).
      const fuerte = t.ventajaGeneral
        ? [...Object.keys(t.ventaja ?? {}), 'todo']
        : t.hangar // el Portanaves pelea con sus cazas
          ? Object.keys(TIPOS[t.hangar.tipo].ventaja ?? {})
          : Object.keys(t.ventaja ?? {})
      const debil = ORDEN_TIPOS.filter((k) => k !== clave && TIPOS[k].ventaja?.[clave])
      const nombres = (l) => l.map((k) => (k === 'todo' ? '+25% a todo' : TIPOS[k].nombre)).join(', ') || '—'
      const fila = document.createElement('div')
      fila.className = 'tipo-fila'
      fila.innerHTML = `
        <div class="tipo-info">
          <h4>${t.nombre}<small>${t.porBatallon > 1 ? `batallón de ${t.porBatallon}` : 'nave capital'}</small></h4>
          <div class="rol">${t.rol}</div>
          <div class="stats">
            <span class="at">Ataque <b>${t.ataque}</b></span>
            <span class="es">Escudo <b>${t.escudo}</b></span>
            <span class="et">Estructura <b>${t.estructura}</b></span>
            <span>Velocidad <b>${t.velocidad}</b></span>
          </div>
        </div>
        <div class="tipo-contras">
          <div><span class="fuerte">Fuerte contra</span> ${nombres(fuerte)}</div>
          <div><span class="debil">Débil contra</span> ${nombres(debil)}</div>
        </div>
        <div class="contador">
          <button class="btn" data-menos="${clave}">−</button>
          <span class="n" id="n-${clave}">0</span>
          <button class="btn" data-mas="${clave}">+</button>
          <span class="costo">${t.costo} pts</span>
        </div>`
      lista.appendChild(fila)
    }
    lista.addEventListener('click', (e) => {
      const mas = e.target.dataset.mas
      const menos = e.target.dataset.menos
      if (mas && this.usado() + TIPOS[mas].costo <= this.config.presupuesto) this.config.flota[mas]++
      if (menos && this.config.flota[menos] > 0) this.config.flota[menos]--
      this.refrescarFlota()
    })

    const sd = $('#selector-dificultad')
    for (const [k, d] of Object.entries(DIFICULTADES)) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = d.nombre
      b.dataset.dif = k
      b.onclick = () => {
        this.config.dificultad = k
        this.refrescarFlota()
      }
      sd.appendChild(b)
    }
    const sc = $('#selector-calidad')
    for (const [k, n] of [['alta', 'Alta'], ['baja', 'Liviana']]) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = n
      b.dataset.cal = k
      b.onclick = () => {
        this.config.calidad = k
        try { localStorage.setItem('calidad', k) } catch {}
        this.refrescarFlota()
      }
      sc.appendChild(b)
    }
    const sp = $('#selector-presupuesto')
    for (const p of PRESUPUESTOS) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = p.nombre
      b.title = `${p.valor} puntos`
      b.dataset.pres = p.valor
      b.onclick = () => this.cambiarPresupuesto(p.valor, true)
      sp.appendChild(b)
    }
    const sm = $('#selector-mapa')
    for (const [k, m] of [...Object.entries(MAPAS), ['azar', { corto: 'Al azar', descripcion: 'Un mapa sorpresa.' }]]) {
      const b = document.createElement('button')
      b.className = 'btn'
      b.textContent = m.corto
      b.title = m.descripcion
      b.dataset.mapa = k
      b.onclick = () => {
        this.config.mapa = k
        try { localStorage.setItem('mapa', k) } catch {}
        this.refrescarFlota()
      }
      sm.appendChild(b)
    }
    for (const b of document.querySelectorAll('[data-presupuesto]'))
      b.onclick = () => this.cambiarPresupuesto(this.config.presupuesto + Number(b.dataset.presupuesto))
    this.refrescarFlota()
  }

  cambiarPresupuesto(valor, rearmar = false) {
    const c = this.config
    c.presupuesto = limitar(valor)
    try { localStorage.setItem('presupuesto', c.presupuesto) } catch {}
    if (rearmar) return this.sugerida()
    // Si la flota ya no entra, se recorta de lo que más pesa en ella.
    while (this.usado() > c.presupuesto) {
      const k = ORDEN_TIPOS.reduce((a, b) => (c.flota[b] * TIPOS[b].costo > c.flota[a] * TIPOS[a].costo ? b : a))
      c.flota[k]--
    }
    this.refrescarFlota()
  }

  // Flota sugerida para el presupuesto: Acorazados en las batallas grandes,
  // un Portanaves desde 6000 y el resto repartido como la mezcla base (3 Cazas, 2 Corbetas, 2
  // Bombarderos, 2 Cruceros), completando lo que sobre.
  sugerida() {
    const p = this.config.presupuesto
    const flota = Object.fromEntries(ORDEN_TIPOS.map((k) => [k, 0]))
    if (p >= 8000) flota.acorazado = Math.floor(p / 8000)
    if (p >= 6000) flota.portanaves = 1
    const mezcla = { caza: 3, corbeta: 2, bombardero: 2, crucero: 2 }
    const costoMezcla = Object.entries(mezcla).reduce((s, [k, n]) => s + TIPOS[k].costo * n, 0)
    const f = (p - flota.acorazado * TIPOS.acorazado.costo - flota.portanaves * TIPOS.portanaves.costo) / costoMezcla
    for (const [k, n] of Object.entries(mezcla)) flota[k] = Math.floor(n * f)
    this.config.flota = flota
    for (let agrego = true; agrego; ) {
      agrego = false
      for (const k of ['caza', 'corbeta', 'bombardero', 'crucero'])
        if (this.usado() + TIPOS[k].costo <= p) {
          flota[k]++
          agrego = true
        }
    }
    this.refrescarFlota()
  }

  usado() {
    return ORDEN_TIPOS.reduce((s, k) => s + (this.config.flota[k] ?? 0) * TIPOS[k].costo, 0)
  }

  refrescarFlota() {
    for (const k of ORDEN_TIPOS) $(`#n-${k}`).textContent = this.config.flota[k]
    const u = this.usado()
    const total = this.config.presupuesto
    $('#presupuesto-usado').textContent = u
    $('#presupuesto-total').textContent = total
    $('#presupuesto-total-2').textContent = total
    const f = this.config.flota
    const naves = ORDEN_TIPOS.reduce((n, k) => n + f[k] * TIPOS[k].porBatallon, 0)
    const batallones = ORDEN_TIPOS.reduce((n, k) => n + f[k], 0)
    $('#composicion').innerHTML = `<b>${naves}</b> naves en <b>${batallones}</b> batallones<span>${ORDEN_TIPOS.filter((k) => f[k]).map((k) => `${f[k]} ${TIPOS[k].nombre}`).join(' · ')}</span>`
    const fa = FACCIONES[this.config.faccion]
    $('#armado-faccion').innerHTML = `<i style="background:${fa.acentoCss}"></i>${fa.nombre}`
    $('#armado-faccion').title = `${fa.rasgo.nombre}: ${fa.rasgo.efectos.join(' · ')}`
    $('[data-accion="volver-faccion"]').textContent = this.modo === 'multi' ? '‹ Salir de la sala' : this.faccionFija() ? '‹ Inicio' : '‹ Facción'
    $('#presupuesto-barra').style.width = `${(u / total) * 100}%`
    for (const b of document.querySelectorAll('[data-pres]')) b.classList.toggle('activo', Number(b.dataset.pres) === total)
    for (const b of document.querySelectorAll('[data-dif]')) b.classList.toggle('activo', b.dataset.dif === this.config.dificultad)
    for (const b of document.querySelectorAll('[data-cal]')) b.classList.toggle('activo', b.dataset.cal === this.config.calidad)
    for (const b of document.querySelectorAll('[data-mapa]')) b.classList.toggle('activo', b.dataset.mapa === this.config.mapa)
    $('#nota-mapa').textContent = (MAPAS[this.config.mapa] ?? { descripcion: 'Un mapa sorpresa.' }).descripcion
    $('#btn-combatir').disabled = u === 0
  }

  // Informe de batalla: los dos bandos lado a lado (qué tenían, qué les
  // quedó), el puntaje con su desglose y el batallón destacado.
  mostrarFin(informe, mapa, config = this.config) {
    const n = (x) => Math.round(x).toLocaleString('es-AR')
    const victoria = informe.resultado === 'victoria'
    const c = config
    $('#fin-titulo').textContent = victoria ? 'Victoria' : 'Derrota'
    $('#fin-calificacion').textContent = informe.calificacion
    const m = Math.floor(informe.segundos / 60)
    const s = String(Math.floor(informe.segundos % 60)).padStart(2, '0')
    const tamaño = PRESUPUESTOS.find((p) => p.valor === c.presupuesto)?.nombre ?? 'Batalla'
    // En red no hay dificultad, y "otra batalla" vuelve a la sala de espera.
    const revancha = document.querySelector('#pantalla-fin [data-accion="revancha"], #pantalla-fin [data-accion="multijugador"]')
    revancha.dataset.accion = c.enRed ? 'multijugador' : 'revancha'
    revancha.textContent = c.enRed ? 'Otra batalla en red' : 'Revancha'
    $('#pantalla-fin [data-accion="cambiar-flota"]').hidden = !!c.enRed
    $('#fin-meta').innerHTML = [mapa, `${tamaño} · ${n(c.presupuesto)} pts`, c.enRed ? 'Multijugador' : DIFICULTADES[c.dificultad].nombre, `${m}:${s}`]
      .map((x) => `<span>${x}</span>`)
      .join('')

    informe.lados.forEach((lado, i) => {
      const f = FACCIONES[lado.faccion]
      const pct = Math.round(lado.conservado * 100)
      $(`#fin-lado-${i}`).style.setProperty('--color', f.acentoCss)
      $(`#fin-lado-${i}`).innerHTML = `
        <div class="lado-cab"><span>${i === 0 ? 'Tu flota' : 'Enemigo'}</span><b>${f.nombre}</b></div>
        <div class="conservado"><b>${pct}%</b><span>de la flota sigue en pie</span></div>
        <div class="barra-lado"><i style="width:${pct}%"></i></div>
        <div class="detalle-naves">${lado.quedan} de ${lado.naves} naves</div>
        <table class="tabla-tipos">
          ${lado.porTipo
            .map(
              (t) => `<tr><td>${t.nombre}</td><td class="num">${t.quedan}<small> / ${t.total}</small></td>
                <td class="mini"><i style="width:${(t.quedan / t.total) * 100}%"></i></td></tr>`,
            )
            .join('')}
        </table>
        <div class="daño-lado">Daño causado <b>${n(lado.daño)}</b></div>`
    })

    const d = informe.desglose
    const linea = (txt, v, nota) => `<div class="linea-puntaje"><span>${txt}</span><b>${v > 0 ? '+' + n(v) : '—'}</b>${nota ? `<small>${nota}</small>` : ''}</div>`
    $('#fin-puntaje').innerHTML = `
      <div class="puntaje-titulo">Puntaje</div>
      <div class="puntaje-total">${n(informe.puntaje)}</div>
      ${linea('Valor enemigo destruido', d.destruido)}
      ${linea('Flota conservada', d.supervivencia, victoria ? '' : 'solo en victoria')}
      ${linea('Rapidez', d.rapidez, victoria ? '' : 'solo en victoria')}
      <div class="linea-puntaje mult"><span>Dificultad ${DIFICULTADES[c.dificultad].nombre}</span><b>×${d.multiplicador}</b></div>`

    const b = informe.destacado
    $('#fin-destacado').innerHTML =
      b && b.dañoCausado > 0
        ? `<span class="etiqueta">Batallón destacado</span><b>${b.nombre}</b><span>${n(b.dañoCausado)} de daño · ${b.bajas} ${b.bajas === 1 ? 'nave derribada' : 'naves derribadas'}${b.viva ? '' : ' · cayó en combate'}</span>`
        : ''
    mostrarPantalla('pantalla-fin')
  }
}

// Rasgo de batalla de una facción, para las tarjetas y la ventana de cuenta.
export function bloqueRasgo(f) {
  return `<div class="rasgo"><div class="rasgo-nombre">En batalla · ${f.rasgo.nombre}</div>
    <ul>${f.rasgo.efectos.map((e) => `<li class="${e.startsWith('−') ? 'contra' : 'pro'}">${e}</li>`).join('')}</ul>
    <div class="rasgo-estilo">${f.rasgo.estilo}</div></div>`
}

function limitar(v) {
  return Math.min(PRESUPUESTO_MAX, Math.max(PRESUPUESTO_MIN, Math.round(v / 500) * 500))
}

function guardado(clave, porDefecto) {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}

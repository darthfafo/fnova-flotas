// Terreno del mapa: asteroides (obstáculos sólidos que frenan disparos y
// sirven de cobertura) y nebulosas (zonas que esconden a las naves de los
// sensores enemigos). Solo datos y consultas geométricas; el dibujo vive en
// motor/terreno3d.js.
import * as THREE from 'three'
import { semilla } from '../motor/escena.js'

export const RADIO_DESTRUCTIBLE = 70

export const MAPAS = {
  abierto: { nombre: 'Espacio abierto', corto: 'Abierto', descripcion: 'Sin obstáculos: gana la mejor flota.' },
  asteroides: { nombre: 'Cinturón de asteroides', corto: 'Asteroides', descripcion: 'Rocas entre las flotas que frenan los disparos.' },
  nebulosa: { nombre: 'Nebulosas', corto: 'Nebulosas', descripcion: 'Nubes que esconden a las naves: ideales para emboscar.' },
  mixto: { nombre: 'Mixto', corto: 'Mixto', descripcion: 'Un poco de cada cosa.' },
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

export class Terreno {
  constructor(tipo, ancho = 1, s = Math.floor(Math.random() * 1e9)) {
    this.tipo = tipo
    this.asteroides = [] // { pos, radio, giro, eje }
    this.nebulosas = [] // { pos, radio, color }
    const azar = semilla(s)
    const r = (a, b) => a + azar() * (b - a)
    // ancho escala el mapa con el tamaño de las flotas.
    const W = 1300 * ancho

    if (tipo === 'asteroides' || tipo === 'mixto') {
      const cantidad = tipo === 'mixto' ? 30 : 55
      for (let i = 0; i < cantidad; i++) {
        const grande = azar() < 0.12
        this.agregarAsteroide(
          new THREE.Vector3(r(-W, W), r(-260, 260), r(-380, 380) + (tipo === 'mixto' ? r(-100, 100) : 0)),
          grande ? r(110, 190) : r(14, 70),
          azar,
        )
      }
      // Algún grupo cerca de cada flota para cubrirse antes del choque.
      for (const z of [-520, 520])
        for (let i = 0; i < 4; i++) this.agregarAsteroide(new THREE.Vector3(r(-W * 0.7, W * 0.7), r(-150, 150), z + r(-120, 120)), r(30, 90), azar)
    }
    if (tipo === 'nebulosa' || tipo === 'mixto') {
      const colores = [0x7a4cff, 0x2fb5c9, 0xd4733a, 0xc04a8f]
      const lugares =
        tipo === 'mixto'
          ? [new THREE.Vector3(-W * 0.75, 0, 0)]
          : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-W * 0.8, 40, -250), new THREE.Vector3(W * 0.8, -40, 250)]
      for (const pos of lugares)
        this.nebulosas.push({ pos, radio: r(380, 520) * (pos.x === 0 ? 1 : 0.9), color: colores[Math.floor(azar() * colores.length)] })
    }
  }

  agregarAsteroide(pos, radio, azar) {
    // No pisar a otro asteroide.
    for (const a of this.asteroides) if (a.pos.distanceTo(pos) < a.radio + radio + 10) return
    this.asteroides.push({
      pos,
      radio,
      // Las rocas chicas aguantan una cantidad de daño y se rompen; las
      // grandes son indestructibles (siempre queda algo de terreno).
      vida: radio <= RADIO_DESTRUCTIBLE ? radio * 5 : Infinity,
      eje: new THREE.Vector3(azar() - 0.5, azar() - 0.5, azar() - 0.5).normalize(),
      giro: (azar() - 0.5) * (radio > 100 ? 0.04 : 0.25),
      forma: Math.floor(azar() * 4),
    })
  }

  // Resta vida a una roca; devuelve true si se rompió (y la saca del mapa).
  dañar(asteroide, daño) {
    if (asteroide.destruido || asteroide.vida === Infinity) return false
    asteroide.vida -= daño
    if (asteroide.vida > 0) return false
    asteroide.destruido = true
    this.asteroides.splice(this.asteroides.indexOf(asteroide), 1)
    return true
  }

  nebulosaEn(pos) {
    for (const n of this.nebulosas) if (n.pos.distanceToSquared(pos) < n.radio * n.radio) return n
    return null
  }

  // Primer asteroide que corta el segmento origen→destino (o null) y el
  // punto donde lo toca.
  bloquea(origen, destino) {
    const dir = _a.copy(destino).sub(origen)
    const largo = dir.length()
    if (largo < 1e-3) return null
    dir.divideScalar(largo)
    let mejor = null
    let tMejor = largo
    for (const a of this.asteroides) {
      const oc = _b.copy(a.pos).sub(origen)
      const proy = oc.dot(dir)
      if (proy < -a.radio || proy > tMejor + a.radio) continue
      const d2 = oc.lengthSq() - proy * proy
      const r2 = a.radio * a.radio * 0.85 // la roca no es una esfera perfecta
      if (d2 > r2) continue
      const t = proy - Math.sqrt(r2 - d2)
      if (t > 0 && t < tMejor) {
        tMejor = t
        mejor = a
      }
    }
    return mejor ? { asteroide: mejor, distancia: tMejor } : null
  }

  // Ajusta la dirección deseada (normalizada) para rodear asteroides que
  // haya adelante, dentro de `alcance`.
  desviar(pos, dir, radioNave, alcance) {
    for (const a of this.asteroides) {
      const oc = _b.copy(a.pos).sub(pos)
      const proy = oc.dot(dir)
      const margen = a.radio + radioNave + 15
      if (proy < 0 || proy > alcance + margen) continue
      const lateral = oc.addScaledVector(dir, -proy) // del rumbo al centro de la roca
      const d = lateral.length()
      if (d > margen) continue
      // Gira hacia el lado opuesto al centro, más fuerte cuanto más cerca.
      const fuerza = (1 - d / margen) * (1 - proy / (alcance + margen)) * 2.2
      if (d < 1e-3) lateral.set(0, 1, 0)
      else lateral.divideScalar(d)
      dir.addScaledVector(lateral, -fuerza)
    }
    return dir.normalize()
  }

  // Saca a la nave de adentro de una roca (por si la empujaron).
  expulsar(pos, radioNave) {
    for (const a of this.asteroides) {
      const min = a.radio + radioNave * 0.6
      const d2 = a.pos.distanceToSquared(pos)
      if (d2 >= min * min) continue
      const d = Math.sqrt(d2) || 1
      pos.sub(a.pos).multiplyScalar(min / d).add(a.pos)
    }
  }
}

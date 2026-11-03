// Estructuras de la campaña armadas con geometría simple: no hay modelos
// listos que combinen, y así pesan nada. Cada una devuelve lo mismo que un
// modelo cargado: una geometría con dos grupos (casco y luces) y sus dos
// materiales. El color saturado de las luces pasa al acento de la facción.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const casco = () => new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 0.2, roughness: 0.7 })
const luces = () => new THREE.MeshStandardMaterial({ color: 0xff5a20, metalness: 0.1, roughness: 0.5 })

function pieza(geo, { pos = [0, 0, 0], rot = [0, 0, 0], escala = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...escala),
  )
  const g = geo.index ? geo.toNonIndexed() : geo
  g.applyMatrix4(m)
  for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a)
  return g
}

function armar(partesCasco, partesLuces) {
  return {
    geometry: mergeGeometries([mergeGeometries(partesCasco), mergeGeometries(partesLuces)], true),
    material: [casco(), luces()],
  }
}

const cilindro = (r1, r2, h, lados = 16) => new THREE.CylinderGeometry(r1, r2, h, lados)
const caja = (x, y, z) => new THREE.BoxGeometry(x, y, z)
const aro = (r, t, lados = 40) => new THREE.TorusGeometry(r, t, 8, lados)
const PLANO = [Math.PI / 2, 0, 0] // acuesta un aro sobre el plano XZ

// Puesto de frontera: núcleo, aro habitable, rayos y muelles.
function estacion() {
  const c = [
    pieza(cilindro(8, 8, 26)),
    pieza(cilindro(3, 8, 12), { pos: [0, 19, 0] }),
    pieza(cilindro(8, 3, 12), { pos: [0, -19, 0] }),
    pieza(aro(26, 3.2), { rot: PLANO }),
    pieza(cilindro(0.6, 0.6, 22, 6), { pos: [0, 34, 0] }),
  ]
  const l = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    c.push(pieza(caja(20, 1.8, 2.4), { pos: [Math.cos(a) * 16, 0, Math.sin(a) * 16], rot: [0, -a, 0] }))
    c.push(pieza(caja(5, 3, 9), { pos: [Math.cos(a) * 31, 0, Math.sin(a) * 31], rot: [0, -a, 0] }))
    l.push(pieza(caja(5.4, 0.6, 3), { pos: [Math.cos(a) * 31, 1.8, Math.sin(a) * 31], rot: [0, -a, 0] }))
  }
  l.push(pieza(aro(26, 0.7), { rot: PLANO, pos: [0, 3, 0] }))
  l.push(pieza(new THREE.OctahedronGeometry(1.6), { pos: [0, 45, 0] }))
  return armar(c, l)
}

// Laboratorio de un bastión: esfera blindada con el Núcleo a la vista.
function laboratorio() {
  const c = [
    pieza(new THREE.IcosahedronGeometry(20, 1)),
    pieza(aro(30, 2.4), { rot: PLANO }),
    pieza(aro(36, 1.6), { rot: [Math.PI / 2 + 0.5, 0.3, 0] }),
    pieza(cilindro(6, 12, 16), { pos: [0, -24, 0] }),
  ]
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    c.push(pieza(caja(7, 26, 7), { pos: [Math.cos(a) * 24, 10, Math.sin(a) * 24], rot: [0, -a, 0.3] }))
  }
  return armar(c, [pieza(new THREE.OctahedronGeometry(9), { pos: [0, 26, 0] }), pieza(aro(13, 0.8), { rot: PLANO, pos: [0, 26, 0] })])
}

// Repetidor de la Mente: aguja con aletas y un ojo arriba.
function repetidor() {
  const c = [pieza(cilindro(1.5, 6, 60, 6)), pieza(cilindro(8, 3, 8, 6), { pos: [0, -32, 0] })]
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    c.push(pieza(caja(1.2, 34, 14), { pos: [Math.cos(a) * 9, -8, Math.sin(a) * 9], rot: [0, -a + Math.PI / 2, 0] }))
  }
  return armar(c, [pieza(new THREE.OctahedronGeometry(6), { pos: [0, 37, 0] }), pieza(aro(9, 0.6, 24), { rot: PLANO, pos: [0, 37, 0] })])
}

// La Mente: un cuerpo oscuro y facetado rodeado de aros, con el corazón encendido.
function mente() {
  const c = [pieza(new THREE.IcosahedronGeometry(30, 0), { escala: [1, 1.25, 1] })]
  for (let i = 0; i < 3; i++) c.push(pieza(aro(48 + i * 11, 1.8, 48), { rot: [Math.PI / 2 + i * 0.5, i * 0.7, 0] }))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    c.push(pieza(new THREE.TetrahedronGeometry(7), { pos: [Math.cos(a) * 72, Math.sin(a * 2) * 12, Math.sin(a) * 72], rot: [a, a * 2, 0] }))
  }
  return armar(c, [pieza(new THREE.IcosahedronGeometry(33, 0), { escala: [0.42, 1.34, 0.42] }), pieza(aro(36, 0.9, 48), { rot: PLANO })])
}

export const ESTRUCTURAS = { 'gen-estacion': estacion, 'gen-laboratorio': laboratorio, 'gen-repetidor': repetidor, 'gen-mente': mente }

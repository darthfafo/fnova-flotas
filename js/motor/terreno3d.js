// Dibujo del terreno: asteroides como rocas instanciadas (4 formas, una
// llamada de dibujo por forma) y nebulosas como nubes de sprites aditivos.
import * as THREE from 'three'
import { semilla } from './escena.js'

const FORMAS = 4

// Ruido de valor 3D (suave, determinista por semilla) y su suma en octavas.
function crearRuido(s) {
  const azar = semilla(s)
  const tabla = new Float32Array(512).map(() => azar())
  const perm = new Uint16Array(512).map((_, i) => i % 256)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]
  const h = (x, y, z) => tabla[perm[(perm[(perm[x & 255] + y) & 511] + z) & 511]]
  const suave = (t) => t * t * (3 - 2 * t)
  const ruido = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
    const u = suave(x - xi), v = suave(y - yi), w = suave(z - zi)
    const l = (a, b, t) => a + (b - a) * t
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w,
    ) * 2 - 1
  }
  return (x, y, z, octavas = 5) => {
    let total = 0, amp = 0.5, frec = 1
    for (let o = 0; o < octavas; o++) {
      total += ruido(x * frec, y * frec, z * frec) * amp
      amp *= 0.5
      frec *= 2.1
    }
    return total
  }
}

// Roca: esfera deformada con ruido en varias escalas, unos cráteres y
// color por vértice (zonas más claras y más oscuras). Sombreado liso.
function geometriaRoca(s) {
  const azar = semilla(s)
  const fbm = crearRuido(s)
  const g = new THREE.SphereGeometry(1, 72, 54)
  const p = g.attributes.position
  const colores = new Float32Array(p.count * 3)
  const v = new THREE.Vector3()
  const estirar = new THREE.Vector3(0.8 + azar() * 0.5, 0.65 + azar() * 0.3, 0.8 + azar() * 0.4)
  const crateres = Array.from({ length: 5 + Math.floor(azar() * 4) }, () => ({
    d: new THREE.Vector3(azar() - 0.5, azar() - 0.5, azar() - 0.5).normalize(),
    r: 0.18 + azar() * 0.3,
    prof: 0.05 + azar() * 0.08,
  }))
  const base = new THREE.Color(0x5a5149)
  const claro = new THREE.Color(0x8f8172)
  const oscuro = new THREE.Color(0x221e1a)
  const oxido = new THREE.Color(0x6e4630)
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // Forma general (baja frecuencia) + detalle fino.
    // Forma (baja frecuencia), lomas (media) y aristas rugosas (alta, "ridged").
    const arista = 1 - Math.abs(fbm(v.x * 9 + 3, v.y * 9, v.z * 9, 2))
    let k =
      1 +
      fbm(v.x * 1.3 + 5, v.y * 1.3, v.z * 1.3, 3) * 0.55 +
      fbm(v.x * 4, v.y * 4, v.z * 4 + 9, 3) * 0.12 +
      arista * arista * 0.035
    let enCrater = 0
    for (const cr of crateres) {
      const d = v.distanceTo(cr.d) / cr.r
      if (d < 1) {
        // Cuenco con un borde levemente levantado.
        k -= cr.prof * (1 - d * d)
        enCrater = Math.max(enCrater, 1 - d)
      } else if (d < 1.3) k += cr.prof * 0.35 * (1 - (d - 1) / 0.3)
    }
    v.multiplyScalar(k).multiply(estirar)
    p.setXYZ(i, v.x, v.y, v.z)
    const t = fbm(v.x * 3 + 20, v.y * 3, v.z * 3, 4)
    const vetas = fbm(v.x * 7, v.y * 7 + 40, v.z * 7, 3)
    c.copy(base)
      .lerp(t > 0 ? claro : oscuro, Math.min(1, Math.abs(t) * 2.4))
      .lerp(oxido, Math.max(0, vetas) * 0.8)
      .lerp(oscuro, enCrater * 0.6)
      .multiplyScalar(0.85 + Math.random() * 0.2)
    colores.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colores, 3))
  // Radio medio ≈ 1, para que la roca coincida con el radio de colisión.
  let suma = 0
  for (let i = 0; i < p.count; i++) suma += v.fromBufferAttribute(p, i).length()
  g.scale(p.count / suma, p.count / suma, p.count / suma)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

// Grano fino de la superficie (relieve por textura, no cuesta geometría).
function texturaGrano() {
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 256
  const g = cv.getContext('2d')
  const img = g.createImageData(512, 256)
  const fbm = crearRuido(3)
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 512; x++) {
      const n = fbm(x / 9, y / 9, 0.5, 4) * 0.6 + (Math.random() - 0.5) * 0.25
      const val = 128 + n * 160
      const i = (y * 512 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val
      img.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(4, 3)
  return t
}

function texturaNube() {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')
  const azar = semilla(42)
  for (let i = 0; i < 14; i++) {
    const x = 64 + (azar() - 0.5) * 50
    const y = 64 + (azar() - 0.5) * 50
    const r = 20 + azar() * 40
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, 'rgba(255,255,255,0.22)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  }
  // Borde suave para que no se note el cuadrado del sprite.
  const mascara = g.createRadialGradient(64, 64, 30, 64, 64, 64)
  mascara.addColorStop(0, 'rgba(0,0,0,0)')
  mascara.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = mascara
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(cv)
}

export class Terreno3D {
  constructor(escena, terreno) {
    this.escena = escena
    this.grupo = new THREE.Group()
    escena.add(this.grupo)
    this.terreno = terreno
    this.mallas = []
    const _m = new THREE.Matrix4()
    const _q = new THREE.Quaternion()

    // Asteroides.
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      bumpMap: texturaGrano(),
      bumpScale: 5,
    })
    for (let f = 0; f < FORMAS; f++) {
      const delaForma = terreno.asteroides.filter((a) => a.forma === f)
      if (!delaForma.length) continue
      const m = new THREE.InstancedMesh(geometriaRoca(f * 31 + 7), mat, delaForma.length)
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      delaForma.forEach((a, i) => {
        a.quat = new THREE.Quaternion().setFromAxisAngle(a.eje, Math.random() * 6)
        m.setMatrixAt(i, _m.compose(a.pos, a.quat, new THREE.Vector3().setScalar(a.radio)))
      })
      m.userData.asteroides = delaForma
      this.grupo.add(m)
      this.mallas.push(m)
    }
    this._m = _m
    this._q = _q

    // Nebulosas: nubes superpuestas, más densas al centro.
    const tex = texturaNube()
    for (const n of terreno.nebulosas) {
      const azar = semilla(Math.round(n.pos.x + n.pos.z * 7))
      const color = new THREE.Color(n.color)
      for (let i = 0; i < 20; i++) {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: tex,
            color: color.clone().offsetHSL((azar() - 0.5) * 0.08, 0, (azar() - 0.5) * 0.1),
            transparent: true,
            opacity: 0.11 + azar() * 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        const d = new THREE.Vector3(azar() - 0.5, (azar() - 0.5) * 0.6, azar() - 0.5).normalize().multiplyScalar(n.radio * Math.sqrt(azar()) * 0.75)
        sp.position.copy(n.pos).add(d)
        sp.scale.setScalar(n.radio * (0.8 + azar() * 0.8))
        sp.material.rotation = azar() * 6
        this.grupo.add(sp)
      }
    }
  }

  actualizar(dt) {
    for (const m of this.mallas) {
      const lista = m.userData.asteroides
      for (let i = 0; i < lista.length; i++) {
        const a = lista[i]
        a.quat.multiply(this._q.setFromAxisAngle(a.eje, a.giro * dt))
        m.setMatrixAt(i, this._m.compose(a.pos, a.quat, new THREE.Vector3(a.radio, a.radio, a.radio)))
      }
      m.instanceMatrix.needsUpdate = true
    }
  }

  destruir() {
    this.escena.remove(this.grupo)
    this.grupo.traverse((o) => {
      if (o.isInstancedMesh) o.geometry.dispose()
      if (o.isSprite) o.material.dispose()
    })
  }
}

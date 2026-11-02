// Dibujo del terreno: asteroides como rocas instanciadas (4 formas, una
// llamada de dibujo por forma) y nebulosas como nubes de sprites aditivos.
import * as THREE from 'three'
import { semilla } from './escena.js'

const FORMAS = 4

function geometriaRoca(s) {
  const azar = semilla(s)
  const g = new THREE.IcosahedronGeometry(1, 2)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  // Abolladuras de baja frecuencia: varias direcciones al azar empujan la superficie.
  const bultos = Array.from({ length: 7 }, () => ({
    d: new THREE.Vector3(azar() - 0.5, azar() - 0.5, azar() - 0.5).normalize(),
    f: (azar() - 0.4) * 0.5,
  }))
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    let k = 1
    for (const b of bultos) k += b.f * Math.max(0, v.dot(b.d)) ** 3
    k *= 0.92 + azar() * 0.12
    v.multiplyScalar(k)
    v.y *= 0.8
    p.setXYZ(i, v.x, v.y, v.z)
  }
  // Vértices de cada triángulo separados: sombreado facetado.
  const facetada = g.toNonIndexed()
  facetada.computeVertexNormals()
  return facetada
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
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.95, metalness: 0.05, flatShading: true })
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

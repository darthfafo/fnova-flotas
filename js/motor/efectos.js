// Efectos visuales en pools de tamaño fijo: partículas (un solo Points),
// proyectiles (un solo InstancedMesh), brillos de motor (otro Points) y
// burbujas de escudo. Nada se crea ni se destruye durante la batalla, así
// el recolector de basura no frena el juego en máquinas modestas.
import * as THREE from 'three'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _v = new THREE.Vector3()
const Z = new THREE.Vector3(0, 0, 1)

const VERT_PUNTOS = `
  attribute float tam; attribute float alfa; varying vec3 vC; varying float vA; uniform float escala;
  void main(){
    vC = color; vA = alfa;
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(tam * escala / -mv.z, 256.);
  }`
const FRAG_PUNTOS = `
  varying vec3 vC; varying float vA;
  void main(){
    float d = length(gl_PointCoord - .5) * 2.;
    if (d > 1.) discard;
    float k = pow(1. - d, 1.8);
    gl_FragColor = vec4(vC * k * vA, 1.);
  }`

function materialPuntos(escala) {
  return new THREE.ShaderMaterial({
    uniforms: { escala: { value: escala } },
    vertexShader: VERT_PUNTOS,
    fragmentShader: FRAG_PUNTOS,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  })
}

export class Particulas {
  constructor(escena, max, alturaPantalla) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.colBase = new Float32Array(max * 3)
    this.tam = new Float32Array(max)
    this.tamBase = new Float32Array(max)
    this.alfa = new Float32Array(max)
    this.vida = new Float32Array(max)
    this.vidaMax = new Float32Array(max)
    this.crece = new Float32Array(max)
    this.siguiente = 0
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('tam', new THREE.BufferAttribute(this.tam, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('alfa', new THREE.BufferAttribute(this.alfa, 1).setUsage(THREE.DynamicDrawUsage))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7)
    this.puntos = new THREE.Points(geo, materialPuntos(alturaPantalla))
    this.puntos.frustumCulled = false
    escena.add(this.puntos)
  }

  emitir(p, v, color, tam, vida, crece = 0) {
    const i = this.siguiente
    this.siguiente = (i + 1) % this.max
    this.pos[i * 3] = p.x
    this.pos[i * 3 + 1] = p.y
    this.pos[i * 3 + 2] = p.z
    this.vel[i * 3] = v.x
    this.vel[i * 3 + 1] = v.y
    this.vel[i * 3 + 2] = v.z
    this.colBase[i * 3] = color.r
    this.colBase[i * 3 + 1] = color.g
    this.colBase[i * 3 + 2] = color.b
    this.tamBase[i] = tam
    this.vida[i] = vida
    this.vidaMax[i] = vida
    this.crece[i] = crece
  }

  actualizar(dt) {
    const { pos, vel, col, colBase, tam, tamBase, alfa, vida, vidaMax, crece } = this
    for (let i = 0; i < this.max; i++) {
      if (vida[i] <= 0) {
        if (alfa[i] !== 0) {
          alfa[i] = 0
          tam[i] = 0
        }
        continue
      }
      vida[i] -= dt
      const t = Math.max(0, vida[i] / vidaMax[i])
      const k = i * 3
      pos[k] += vel[k] * dt
      pos[k + 1] += vel[k + 1] * dt
      pos[k + 2] += vel[k + 2] * dt
      vel[k] *= 0.985
      vel[k + 1] *= 0.985
      vel[k + 2] *= 0.985
      // Del blanco caliente al color base a medida que se enfría.
      const calor = Math.max(0, t - 0.7) * 1.6
      col[k] = colBase[k] + calor
      col[k + 1] = colBase[k + 1] + calor
      col[k + 2] = colBase[k + 2] + calor
      tam[i] = tamBase[i] * (1 + (1 - t) * crece[i])
      alfa[i] = t
    }
    const a = this.puntos.geometry.attributes
    a.position.needsUpdate = a.color.needsUpdate = a.tam.needsUpdate = a.alfa.needsUpdate = true
  }

  explosion(p, radio, color = COLOR_FUEGO, cantidad = 30) {
    const v = new THREE.Vector3()
    for (let i = 0; i < cantidad; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      v.multiplyScalar(radio * (0.6 + Math.random() * 2.2))
      const c = i % 4 === 0 ? COLOR_CHISPA : color
      this.emitir(p, v, c, radio * (0.5 + Math.random() * 0.7), 0.45 + Math.random() * 0.8, 0.8)
    }
    // Destello central.
    this.emitir(p, v.set(0, 0, 0), COLOR_DESTELLO, radio * 3, 0.18, 0.5)
    // Escombros: brasas chicas que salen rápido y se apagan lento.
    for (let i = 0; i < cantidad / 3; i++) {
      v.randomDirection().multiplyScalar(radio * (3 + Math.random() * 5))
      this.emitir(p, v, COLOR_BRASA, radio * 0.25, 1.5 + Math.random() * 2.5, 0)
    }
    // Humo que queda flotando.
    for (let i = 0; i < cantidad / 4; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(radio * 0.8)
      this.emitir(p, v, COLOR_HUMO, radio * 3, 2 + Math.random() * 2, 1.5)
    }
  }

  chispas(p, normal, color, cantidad = 6, fuerza = 40) {
    const v = new THREE.Vector3()
    for (let i = 0; i < cantidad; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .multiplyScalar(fuerza)
        .addScaledVector(normal, fuerza * 0.6)
      this.emitir(p, v, color, 3 + Math.random() * 4, 0.25 + Math.random() * 0.3)
    }
  }
}

export const COLOR_FUEGO = new THREE.Color(0.75, 0.3, 0.07)
export const COLOR_CHISPA = new THREE.Color(1.0, 0.85, 0.5)
export const COLOR_DESTELLO = new THREE.Color(1.0, 0.9, 0.75)
export const COLOR_HUMO = new THREE.Color(0.09, 0.08, 0.08)
export const COLOR_ESCUDO = new THREE.Color(0.35, 0.75, 1.0)
export const COLOR_BRASA = new THREE.Color(1.0, 0.55, 0.2)
export const COLOR_FLAK = new THREE.Color(0.55, 0.45, 0.35)

// Ondas expansivas: anillos planos aditivos que crecen y se apagan, para
// la destrucción de naves capitales (y, chicas, para los torpedos).
export class Ondas {
  constructor(escena, max) {
    this.lista = []
    const geo = new THREE.RingGeometry(0.82, 1, 64)
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      )
      m.visible = false
      escena.add(m)
      this.lista.push({ malla: m, t: 0, dur: 1, radio: 1 })
    }
    this.i = 0
  }

  lanzar(pos, radio, color, dur = 1.2) {
    const o = this.lista[this.i]
    this.i = (this.i + 1) % this.lista.length
    o.t = 0
    o.dur = dur
    o.radio = radio
    o.malla.visible = true
    o.malla.position.copy(pos)
    o.malla.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().randomDirection().lerp(new THREE.Vector3(0, 1, 0), 0.6).normalize())
    o.malla.material.color.copy(color)
  }

  actualizar(dt) {
    for (const o of this.lista) {
      if (!o.malla.visible) continue
      o.t += dt
      const k = o.t / o.dur
      if (k >= 1) {
        o.malla.visible = false
        continue
      }
      o.malla.scale.setScalar(o.radio * (0.1 + Math.sqrt(k)))
      o.malla.material.opacity = (1 - k) * (1 - k)
    }
  }
}

// Proyectiles: cajas alargadas instanciadas, aditivas, color por instancia.
export class Proyectiles {
  constructor(escena, max) {
    this.max = max
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    this.malla = new THREE.InstancedMesh(geo, mat, max)
    this.malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.malla.setColorAt(0, new THREE.Color())
    this.malla.frustumCulled = false
    this.malla.count = 0
    escena.add(this.malla)
    this.color = new THREE.Color()
  }

  // lista: los proyectiles vivos de la simulación ({pos, dir, largo, grosor, color}).
  dibujar(lista) {
    const n = Math.min(lista.length, this.max)
    for (let i = 0; i < n; i++) {
      const p = lista[i]
      _q.setFromUnitVectors(Z, p.dir)
      _s.set(p.grosor, p.grosor, p.largo)
      _m.compose(p.pos, _q, _s)
      this.malla.setMatrixAt(i, _m)
      this.malla.setColorAt(i, p.color)
    }
    this.malla.count = n
    this.malla.instanceMatrix.needsUpdate = true
    if (this.malla.instanceColor) this.malla.instanceColor.needsUpdate = true
  }
}

// Brillo de motores: un punto aditivo por nave, en la cola.
export class Motores {
  constructor(escena, max, alturaPantalla) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.tam = new Float32Array(max)
    this.alfa = new Float32Array(max)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('tam', new THREE.BufferAttribute(this.tam, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('alfa', new THREE.BufferAttribute(this.alfa, 1).setUsage(THREE.DynamicDrawUsage))
    this.puntos = new THREE.Points(geo, materialPuntos(alturaPantalla))
    this.puntos.frustumCulled = false
    escena.add(this.puntos)
  }

  dibujar(naves) {
    let i = 0
    for (const n of naves) {
      if (i >= this.max) break
      if (!n.viva || !n.tipo.velocidad || (n.malla && !n.malla.visible)) continue
      _v.set(0, 0, n.cola * 0.92).applyQuaternion(n.quat).add(n.pos)
      this.pos.set([_v.x, _v.y, _v.z], i * 3)
      const empuje = 0.35 + 0.65 * Math.min(1, n.velocidad / n.velocidadMax)
      this.col.set([n.colorMotor.r, n.colorMotor.g, n.colorMotor.b], i * 3)
      this.tam[i] = n.radio * (n.esCapital ? 0.8 : 3) * empuje
      this.alfa[i] = 0.9 * empuje
      i++
    }
    for (let k = i; k < this.max; k++) this.alfa[k] = this.tam[k] = 0
    const a = this.puntos.geometry.attributes
    a.position.needsUpdate = a.color.needsUpdate = a.tam.needsUpdate = a.alfa.needsUpdate = true
    this.puntos.geometry.setDrawRange(0, Math.max(i, 1))
  }
}

// Burbuja de escudo: esfera con Fresnel que destella cuando el escudo
// absorbe un impacto.
export class Escudos {
  constructor(escena, max) {
    this.lista = []
    const geo = new THREE.IcosahedronGeometry(1, 3)
    for (let i = 0; i < max; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { c: { value: new THREE.Color() }, a: { value: 0 }, impacto: { value: new THREE.Vector3(0, 0, 1) } },
        vertexShader: `varying vec3 n; varying vec3 v; varying vec3 lp;
          void main(){ lp=normalize(position); n=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 c; uniform float a; uniform vec3 impacto; varying vec3 n; varying vec3 v; varying vec3 lp;
          void main(){ float f=pow(1.-abs(dot(n,v)),2.5); float h=pow(max(dot(lp,impacto),0.),6.); gl_FragColor=vec4(c*(f*.6+h*1.8)*a,1.); }`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
      const m = new THREE.Mesh(geo, mat)
      m.visible = false
      escena.add(m)
      this.lista.push({ malla: m, nave: null, t: 0 })
    }
    this.i = 0
  }

  destello(nave, desde, color) {
    let b = this.lista.find((x) => x.nave === nave)
    if (!b) {
      b = this.lista[this.i]
      this.i = (this.i + 1) % this.lista.length
    }
    b.nave = nave
    b.t = 0.35
    b.malla.visible = true
    b.malla.scale.setScalar(nave.radio * 1.15)
    b.malla.material.uniforms.c.value.copy(color)
    // Dirección del impacto en coordenadas locales de la esfera.
    b.malla.material.uniforms.impacto.value.copy(desde).sub(nave.pos).normalize()
  }

  actualizar(dt) {
    for (const b of this.lista) {
      if (!b.malla.visible) continue
      b.t -= dt
      if (b.t <= 0 || !b.nave.viva) {
        b.malla.visible = false
        b.nave = null
        continue
      }
      b.malla.position.copy(b.nave.pos)
      b.malla.material.uniforms.a.value = b.t / 0.35
    }
  }
}

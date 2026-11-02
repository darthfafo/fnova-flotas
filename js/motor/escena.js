// Renderer, luces y el fondo espacial. Todo el fondo se genera una sola vez
// al arrancar (nebulosa pintada en un canvas, estrellas en un único Points):
// en cada cuadro no cuesta más que dibujar una esfera texturizada.
import * as THREE from 'three'

export function crearEscena(contenedor, calidad) {
  const baja = calidad === 'baja'
  const renderer = new THREE.WebGLRenderer({ antialias: !baja, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, baja ? 1 : 1.5))
  renderer.setSize(contenedor.clientWidth, contenedor.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  contenedor.appendChild(renderer.domElement)

  const escena = new THREE.Scene()
  escena.background = new THREE.Color(0x020308)
  const camara = new THREE.PerspectiveCamera(50, contenedor.clientWidth / contenedor.clientHeight, 1, 60000)

  // Luz cálida de "sol" (el atardecer dorado de FNOVA) + relleno frío.
  const sol = new THREE.DirectionalLight(0xffd29a, 2.6)
  sol.position.set(-0.6, 0.45, -0.65)
  escena.add(sol)
  escena.add(new THREE.HemisphereLight(0x6f8cc0, 0x2a1a10, 0.9))
  escena.add(new THREE.AmbientLight(0x404858, 0.5))

  const fondo = crearFondo(baja)
  escena.add(fondo)

  function redimensionar() {
    const w = contenedor.clientWidth
    const h = contenedor.clientHeight
    renderer.setSize(w, h)
    camara.aspect = w / h
    camara.updateProjectionMatrix()
  }
  window.addEventListener('resize', redimensionar)

  return { renderer, escena, camara, fondo, sol }
}

function crearFondo(baja) {
  const grupo = new THREE.Group()
  grupo.name = 'fondo'

  // Nebulosa: manchas suaves superpuestas en un canvas equirectangular.
  const W = baja ? 1024 : 2048
  const H = W / 2
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')
  g.fillStyle = '#020308'
  g.fillRect(0, 0, W, H)
  const azar = semilla(7)
  const paleta = [
    [255, 150, 60], // ámbar
    [200, 90, 40],
    [70, 110, 220], // azul
    [120, 60, 170], // violeta
    [40, 140, 170],
  ]
  // Banda principal (vía láctea) inclinada, más manchas sueltas.
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 260; i++) {
    const enBanda = i < 180
    const x = azar() * W
    const y = enBanda ? H * 0.5 + Math.sin((x / W) * Math.PI * 2) * H * 0.12 + (azar() - 0.5) * H * 0.18 : azar() * H
    const r = (enBanda ? 40 : 60) + azar() * (enBanda ? 160 : 260)
    const c = paleta[Math.floor(azar() * paleta.length)]
    const a = (enBanda ? 0.05 : 0.03) * (0.4 + azar())
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    for (const dx of [-W, 0, W]) {
      g.save()
      g.translate(dx, 0)
      g.fillRect(x - r, y - r, r * 2, r * 2)
      g.restore()
    }
  }
  // Polvo oscuro que recorta la banda.
  g.globalCompositeOperation = 'source-over'
  for (let i = 0; i < 70; i++) {
    const x = azar() * W
    const y = H * 0.5 + Math.sin((x / W) * Math.PI * 2) * H * 0.12 + (azar() - 0.5) * H * 0.08
    const r = 20 + azar() * 70
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(2,3,8,0.35)')
    grad.addColorStop(1, 'rgba(2,3,8,0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.mapping = THREE.EquirectangularReflectionMapping
  const cielo = new THREE.Mesh(
    new THREE.SphereGeometry(30000, 48, 24),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }),
  )
  cielo.rotation.z = 0.35
  grupo.add(cielo)

  // Estrellas.
  const n = baja ? 2500 : 6000
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const tam = new Float32Array(n)
  const v = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    v.set(azar() * 2 - 1, azar() * 2 - 1, azar() * 2 - 1).normalize().multiplyScalar(25000)
    pos.set([v.x, v.y, v.z], i * 3)
    const t = azar()
    const c = t < 0.15 ? [1, 0.8, 0.6] : t < 0.3 ? [0.7, 0.8, 1] : [1, 1, 1]
    const b = 0.5 + azar() * 0.5
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3)
    tam[i] = azar() < 0.03 ? 3.2 : 1 + azar() * 1.4
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('tam', new THREE.BufferAttribute(tam, 1))
  const estrellas = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: { escala: { value: window.devicePixelRatio } },
      vertexShader: `attribute float tam; varying vec3 vC; uniform float escala;
        void main(){ vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=tam*escala; }`,
      fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(vC*(1.-d*1.6),1.); }`,
      vertexColors: true,
      depthWrite: false,
    }),
  )
  grupo.add(estrellas)

  // Planeta lejano con atmósfera (borde por Fresnel).
  const pcv = document.createElement('canvas')
  pcv.width = 512
  pcv.height = 256
  const pg = pcv.getContext('2d')
  for (let y = 0; y < 256; y++) {
    const t = y / 256
    const ruido = Math.sin(t * 40 + Math.sin(t * 13) * 3) * 0.5 + 0.5
    const r = 150 + ruido * 60
    const gg = 95 + ruido * 40
    const b = 55 + ruido * 20
    pg.fillStyle = `rgb(${r|0},${gg|0},${b|0})`
    pg.fillRect(0, y, 512, 1)
  }
  for (let i = 0; i < 300; i++) {
    pg.fillStyle = `rgba(${azar() < 0.5 ? '90,50,30' : '230,190,140'},${0.08 + azar() * 0.12})`
    pg.beginPath()
    pg.ellipse(azar() * 512, azar() * 256, 10 + azar() * 60, 2 + azar() * 6, 0, 0, Math.PI * 2)
    pg.fill()
  }
  const ptex = new THREE.CanvasTexture(pcv)
  ptex.colorSpace = THREE.SRGBColorSpace
  const planeta = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 64, 32),
    new THREE.MeshStandardMaterial({ map: ptex, roughness: 1, metalness: 0 }),
  )
  planeta.position.set(9000, -5200, -14000)
  planeta.rotation.z = 0.3
  grupo.add(planeta)
  const atm = new THREE.Mesh(
    new THREE.SphereGeometry(4500, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(0xffa860) } },
      vertexShader: `varying vec3 n; varying vec3 v; void main(){ n=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); v=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float f=pow(1.-abs(dot(n,v)),3.); gl_FragColor=vec4(c*f*1.6,f); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  )
  atm.position.copy(planeta.position)
  grupo.add(atm)

  // Sol: un sprite aditivo grande en la dirección de la luz.
  const scv = document.createElement('canvas')
  scv.width = scv.height = 256
  const sg = scv.getContext('2d')
  const sgr = sg.createRadialGradient(128, 128, 0, 128, 128, 128)
  sgr.addColorStop(0, 'rgba(255,250,235,1)')
  sgr.addColorStop(0.08, 'rgba(255,220,160,0.9)')
  sgr.addColorStop(0.3, 'rgba(255,150,60,0.25)')
  sgr.addColorStop(1, 'rgba(255,120,40,0)')
  sg.fillStyle = sgr
  sg.fillRect(0, 0, 256, 256)
  const sol = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(scv), blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  sol.position.set(-0.6, 0.45, -0.65).normalize().multiplyScalar(24000)
  sol.scale.setScalar(7000)
  grupo.add(sol)

  return grupo
}

export function semilla(s) {
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

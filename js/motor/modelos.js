// Carga los .glb (assets/modelos) y los prepara por facción: el mismo modelo
// se tiñe por shader — el casco toma el tinte de la facción y las franjas
// azules originales de la textura pasan al color de acento y brillan. Así
// cambiar un modelo por otro (por ejemplo uno generado desde las imágenes
// de FNOVA) es solo reemplazar el archivo.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FACCIONES, TIPOS } from '../datos.js'
import { ESTRUCTURAS } from './estaciones.js'

const plantillas = {} // `${faccion}/${tipo}` -> { geometria, material, escala, radio, cola }

// Los modelos de Sketchfab (R-LAB, Rylek's Raiders) no apuntan todos a +Z:
// giro en Y que lleva la proa a +Z.
const GIRO = {
  'rlab-ranger': -Math.PI / 2,
  'rlab-skycruiser': Math.PI / 2,
  'rlab-skycruiser-rs': Math.PI / 2,
}

export async function cargarModelos(alProgresar) {
  const loader = new GLTFLoader()
  const archivos = new Set()
  const cargados = {}
  for (const f of Object.values(FACCIONES))
    for (const m of Object.values(f.modelos)) {
      if (ESTRUCTURAS[m]) cargados[m] ??= ESTRUCTURAS[m]()
      else archivos.add(m)
    }
  let hechos = 0
  await Promise.all(
    [...archivos].map(
      (nombre) =>
        new Promise((ok, mal) =>
          loader.load(
            `assets/modelos/${nombre}.glb`,
            (g) => {
              cargados[nombre] = unirMallas(g.scene, nombre)
              alProgresar?.(++hechos / archivos.size)
              ok()
            },
            undefined,
            mal,
          ),
        ),
    ),
  )

  for (const f of Object.values(FACCIONES)) {
    for (const [tipo, nombre] of Object.entries(f.modelos)) {
      const base = cargados[nombre]
      const geo = base.geometry.clone()
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      const centro = bb.getCenter(new THREE.Vector3())
      geo.translate(-centro.x, -centro.y, -centro.z)
      const largo = bb.max.z - bb.min.z
      const escala = TIPOS[tipo].largo / largo
      geo.scale(escala, escala, escala)
      geo.computeBoundingSphere()
      const capital = TIPOS[tipo].clase === 'capital'
      const material = Array.isArray(base.material)
        ? base.material.map((m) => materialTexturado(m, f, capital))
        : materialFaccion(base.material, f, capital)
      plantillas[`${f.clave}/${tipo}`] = {
        geometria: geo,
        material,
        radio: geo.boundingSphere.radius,
        cola: (bb.min.z - centro.z) * escala,
        ancho: (bb.max.x - bb.min.x) * escala,
        alto: (bb.max.y - bb.min.y) * escala,
      }
    }
  }
}

// Los modelos de una sola malla (Quaternius) se usan tal cual. Los de varias
// piezas se juntan en una geometría con un grupo por material, aplicando la
// transformación de cada nodo.
function unirMallas(escena, nombre) {
  const mallas = []
  escena.updateMatrixWorld(true)
  escena.traverse((o) => {
    if (o.isMesh) mallas.push(o)
  })
  if (mallas.length === 1 && !mallas[0].material.normalMap) return mallas[0]
  const materiales = []
  const geos = []
  const giro = new THREE.Matrix4().makeRotationY(GIRO[nombre] ?? 0)
  for (const o of mallas) {
    const g = new THREE.BufferGeometry()
    for (const a of ['position', 'normal', 'uv']) g.setAttribute(a, o.geometry.getAttribute(a))
    g.setIndex(o.geometry.index)
    const geo = g.toNonIndexed()
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(giro, o.matrixWorld))
    let i = materiales.indexOf(o.material)
    if (i < 0) i = materiales.push(o.material) - 1
    geos.push([i, geo])
  }
  // Una geometría por material, en el orden de `materiales`.
  const porMaterial = materiales.map((_, i) => mergeGeometries(geos.filter(([j]) => j === i).map(([, g]) => g)))
  return { geometry: mergeGeometries(porMaterial, true), material: materiales }
}

export function plantilla(faccion, tipo) {
  return plantillas[`${faccion}/${tipo}`]
}

// Raíz (posición y rumbo, la mueve la simulación) > cuerpo (alabeo visual
// de los cazas en los giros) > malla.
export function crearMallaNave(faccion, tipo) {
  const p = plantilla(faccion, tipo)
  const raiz = new THREE.Group()
  const cuerpo = new THREE.Group()
  const malla = new THREE.Mesh(p.geometria, p.material)
  cuerpo.add(malla)
  raiz.add(cuerpo)
  raiz.userData.cuerpo = cuerpo
  return raiz
}

function materialFaccion(original, faccion, capital) {
  const m = new THREE.MeshStandardMaterial({
    map: original.map,
    metalness: 0.45,
    roughness: 0.55,
  })
  const uniforms = {
    uCasco: { value: new THREE.Vector3(...faccion.casco) },
    uAcento: { value: new THREE.Color(faccion.acento) },
    uBrillo: { value: capital ? 1.4 : 1.0 },
  }
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.fragmentShader = s.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uCasco; uniform vec3 uAcento; uniform float uBrillo;\nvoid main() {\n float mascaraAcento = 0.0;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          mascaraAcento = clamp((c.b - max(c.r, c.g)) * 5.0, 0.0, 1.0);
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(c * uCasco, uAcento * (0.35 + lum * 1.4), mascaraAcento);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uAcento * mascaraAcento * 0.3 * uBrillo;`,
      )
  }
  m.customProgramCacheKey = () => `faccion-${faccion.clave}-${capital}`
  return m
}

// Modelos con texturas PBR propias: se conservan relieve, metal y luces, el
// casco toma un poco del tinte de la facción y los colores saturados de la
// pintura (franjas naranjas, rojas) y las luces pasan al color de acento.
function materialTexturado(original, faccion, capital) {
  const m = original.clone()
  m.metalness = Math.min(m.metalness, 0.6) // sin mapa de entorno el metal puro se ve negro
  if (m.emissiveMap) m.emissive.set(0xffffff)
  const uniforms = {
    uCasco: { value: new THREE.Vector3(...faccion.casco) },
    uAcento: { value: new THREE.Color(faccion.acento) },
    uBrillo: { value: capital ? 1.4 : 1.0 },
  }
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.fragmentShader = s.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uCasco; uniform vec3 uAcento; uniform float uBrillo;\nvoid main() {\n float mascaraAcento = 0.0;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float mx = max(c.r, max(c.g, c.b));
          float sat = mx - min(c.r, min(c.g, c.b));
          mascaraAcento = smoothstep(0.16, 0.34, sat) * step(0.1, mx);
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(c * mix(vec3(1.0), uCasco, 0.7), uAcento * (0.3 + lum * 1.5), mascaraAcento);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float le = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
          totalEmissiveRadiance = mix(totalEmissiveRadiance, uAcento * le * 1.6, 0.75) * uBrillo;
          totalEmissiveRadiance += uAcento * mascaraAcento * 0.18 * uBrillo;
        }`,
      )
  }
  m.customProgramCacheKey = () => `texturado-${faccion.clave}-${capital}-${!!m.emissiveMap}-${!!m.normalMap}`
  return m
}

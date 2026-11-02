// Carga los .glb (assets/modelos) y los prepara por facción: el mismo modelo
// se tiñe por shader — el casco toma el tinte de la facción y las franjas
// azules originales de la textura pasan al color de acento y brillan. Así
// cambiar un modelo por otro (por ejemplo uno generado desde las imágenes
// de FNOVA) es solo reemplazar el archivo.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FACCIONES, TIPOS } from '../datos.js'

const plantillas = {} // `${faccion}/${tipo}` -> { geometria, material, escala, radio, cola }

export async function cargarModelos(alProgresar) {
  const loader = new GLTFLoader()
  const archivos = new Set()
  for (const f of Object.values(FACCIONES)) for (const m of Object.values(f.modelos)) archivos.add(m)
  const cargados = {}
  let hechos = 0
  await Promise.all(
    [...archivos].map(
      (nombre) =>
        new Promise((ok, mal) =>
          loader.load(
            `assets/modelos/${nombre}.glb`,
            (g) => {
              let malla
              g.scene.traverse((o) => {
                if (o.isMesh && !malla) malla = o
              })
              cargados[nombre] = malla
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
      const material = materialFaccion(base.material, f, TIPOS[tipo].clase === 'capital')
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

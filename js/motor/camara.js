// Cámara orbital estilo Homeworld, pensada para touchpad:
//   deslizar con dos dedos  → girar alrededor del foco
//   pellizcar               → zoom (el navegador lo manda como wheel + ctrlKey)
//   flechas                 → desplazar el foco · Q/E girar · +/- zoom
// Con una rueda de mouse clásica (saltos grandes y solo verticales) la
// rueda hace zoom, para que también se pueda jugar con mouse.
import * as THREE from 'three'

export class CamaraOrbital {
  constructor(camara, elemento) {
    this.camara = camara
    this.foco = new THREE.Vector3()
    this.focoDeseado = new THREE.Vector3()
    this.yaw = 0.6
    this.pitch = 0.45
    this.dist = 700
    this.distDeseada = 700
    this.distMin = 30
    this.distMax = 9000
    this.seguir = null // función que devuelve un Vector3 a seguir, o null
    this.teclas = new Set()
    this.temblor = 0
    this.suavidad = 6 // qué tan rápido la cámara alcanza su objetivo

    elemento.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        if (e.ctrlKey) {
          // Pellizco del touchpad.
          this.zoom(Math.exp(e.deltaY * 0.012))
        } else if (e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY))) {
          // Rueda de mouse.
          this.zoom(Math.exp(Math.sign(e.deltaY) * 0.18))
        } else {
          // Dos dedos: girar.
          this.yaw += e.deltaX * 0.005
          this.pitch = THREE.MathUtils.clamp(this.pitch + e.deltaY * 0.004, -1.45, 1.45)
        }
      },
      { passive: false },
    )
    // Safari en Mac manda el pellizco como gesture*, no como wheel.
    let escalaGesto = 1
    elemento.addEventListener('gesturestart', (e) => {
      e.preventDefault()
      escalaGesto = 1
    })
    elemento.addEventListener('gesturechange', (e) => {
      e.preventDefault()
      this.zoom(escalaGesto / e.scale)
      escalaGesto = e.scale
    })
  }

  sacudir(fuerza) {
    this.temblor = Math.min(30, this.temblor + fuerza)
  }

  zoom(factor) {
    this.distDeseada = THREE.MathUtils.clamp(this.distDeseada * factor, this.distMin, this.distMax)
  }

  enfocar(punto, dist) {
    this.focoDeseado.copy(punto)
    if (dist) this.distDeseada = dist
  }

  actualizar(dt) {
    const t = this.teclas
    const velPan = this.dist * 0.9 * dt
    const adelante = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const derecha = new THREE.Vector3(-adelante.z, 0, adelante.x)
    let movio = false
    if (t.has('ArrowUp')) (this.focoDeseado.addScaledVector(adelante, velPan), (movio = true))
    if (t.has('ArrowDown')) (this.focoDeseado.addScaledVector(adelante, -velPan), (movio = true))
    if (t.has('ArrowRight')) (this.focoDeseado.addScaledVector(derecha, velPan), (movio = true))
    if (t.has('ArrowLeft')) (this.focoDeseado.addScaledVector(derecha, -velPan), (movio = true))
    if (t.has('PageUp')) (this.focoDeseado.y += velPan, (movio = true))
    if (t.has('PageDown')) (this.focoDeseado.y -= velPan, (movio = true))
    if (t.has('q')) this.yaw -= 1.6 * dt
    if (t.has('e')) this.yaw += 1.6 * dt
    if (t.has('+') || t.has('=')) this.zoom(Math.exp(-1.5 * dt))
    if (t.has('-')) this.zoom(Math.exp(1.5 * dt))
    if (movio) this.seguir = null
    if (this.seguir) {
      const p = this.seguir()
      if (p) this.focoDeseado.copy(p)
      else this.seguir = null
    }

    const k = 1 - Math.exp(-dt * this.suavidad)
    this.foco.lerp(this.focoDeseado, k)
    this.dist += (this.distDeseada - this.dist) * k
    const cp = Math.cos(this.pitch)
    this.camara.position.set(
      this.foco.x + Math.sin(this.yaw) * cp * this.dist,
      this.foco.y + Math.sin(this.pitch) * this.dist,
      this.foco.z + Math.cos(this.yaw) * cp * this.dist,
    )
    this.camara.lookAt(this.foco)
    if (this.temblor > 0.05) {
      const t = this.temblor
      this.camara.position.x += (Math.random() - 0.5) * t
      this.camara.position.y += (Math.random() - 0.5) * t
      this.camara.position.z += (Math.random() - 0.5) * t
      this.temblor *= Math.exp(-dt * 5)
    }
  }
}

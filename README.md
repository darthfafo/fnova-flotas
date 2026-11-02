# FNOVA Flotas

Batallas 3D de escuadrones en el espacio, con estética e interfaz inspiradas en
Homeworld 2 y las naves de combate de FNOVA (Caza, Corbeta, Bombardero, Crucero,
Acorazado) con sus stats de Ataque / Escudo / Estructura y sus contras.

## Cómo jugar

**Online:** https://darthfafo.github.io/fnova-flotas/

En tu compu:

- **Mac:** doble clic en `iniciar.command`
- **Windows:** doble clic en `iniciar.bat`
- A mano: `python3 herramientas/servidor.py` en esta carpeta y abrir http://localhost:8765

Necesita un servidor local (los navegadores no cargan modelos 3D desde `file://`)
e internet para bajar Three.js desde el CDN.

## Estructura

```
index.html, css/estilo.css   interfaz (menús + HUD estilo Homeworld 2)
js/datos.js                  facciones, naves, contras, formaciones, tácticas
js/sim/batalla.js            simulación: movimiento, formaciones, disparos, escudos
js/sim/ia.js                 comandante enemigo
js/motor/                    escena, modelos .glb teñidos por facción, cámara, efectos
js/entrada.js                selección y órdenes (touchpad + teclado)
js/ui/                       menús y HUD
assets/modelos/*.glb         naves (Quaternius, CC0)
herramientas/                conversor Godot → glb y vista de modelos
```

## Cambiar una nave

Copiá un `.glb` nuevo en `assets/modelos/` y poné su nombre en
`FACCIONES[...].modelos` de `js/datos.js`. El motor lo centra, lo escala al
largo del tipo de nave y lo tiñe con los colores de la facción.

El sonido se sintetiza en el navegador (Web Audio, sin archivos) y se activa o
silencia con el botón **Sonido** de la barra superior.

En la consola del navegador, `__flotas.simular(30)` adelanta la batalla 30 segundos.

## Balance

`herramientas/balance.js` enfrenta flotas sin dibujar (con el juego abierto,
desde la consola):

```js
const B = await import('/herramientas/balance.js')
B.tablaDuelos(3600, 8)                          // cada tipo contra cada tipo, a igual costo
B.enfrentar({ caza: 3, crucero: 2 }, { corbeta: 9 }, 8)
```


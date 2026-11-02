#!/usr/bin/env python3
"""Empaqueta un .gltf de Sketchfab (scene.gltf + scene.bin + textures/) en un
solo .glb para el juego, achicando las texturas a JPEG de como máximo
<lado> px con `sips` (viene con macOS). Solo usa la biblioteca estándar.

Uso: python3 -I gltf_a_glb.py <carpeta con scene.gltf> <salida.glb> [lado=1024]
"""
import json
import os
import struct
import subprocess
import sys
import tempfile


def achicar(ruta, lado, temporal):
    salida = os.path.join(temporal, os.path.basename(ruta) + '.jpg')
    subprocess.run(
        ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', str(lado), ruta, '--out', salida],
        check=True, capture_output=True,
    )
    # sips no agranda: las texturas chiquitas quedan como estaban.
    return open(salida, 'rb').read()


def empaquetar(carpeta, destino, lado):
    g = json.load(open(os.path.join(carpeta, 'scene.gltf')))
    binario = bytearray(open(os.path.join(carpeta, g['buffers'][0]['uri']), 'rb').read())
    with tempfile.TemporaryDirectory() as temporal:
        for img in g.get('images', []):
            datos = achicar(os.path.join(carpeta, img.pop('uri')), lado, temporal)
            while len(binario) % 4:
                binario.append(0)
            g['bufferViews'].append({'buffer': 0, 'byteOffset': len(binario), 'byteLength': len(datos)})
            binario += datos
            img['bufferView'] = len(g['bufferViews']) - 1
            img['mimeType'] = 'image/jpeg'
    # Sin transparencia: las naves son opacas (alguna viene marcada BLEND sin motivo).
    for m in g.get('materials', []):
        m.pop('alphaMode', None)
    while len(binario) % 4:
        binario.append(0)
    g['buffers'] = [{'byteLength': len(binario)}]
    texto = json.dumps(g, separators=(',', ':')).encode()
    texto += b' ' * (-len(texto) % 4)
    total = 12 + 8 + len(texto) + 8 + len(binario)
    with open(destino, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(texto), 0x4E4F534A) + texto)
        f.write(struct.pack('<II', len(binario), 0x004E4942) + binario)
    print(f'{destino}: {total / 1024:.0f} KB')


if __name__ == '__main__':
    empaquetar(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)

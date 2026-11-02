#!/usr/bin/env python3
"""Convierte los ArrayMesh de Godot 3 (.tscn, formato comprimido octaedral)
del pack CC0 "Ultimate Spaceships" de Quaternius a .glb con la textura
embebida. Solo usa la biblioteca estándar.

Uso: python3 tscn_a_glb.py <malla.tscn> <textura.png> <salida.glb>
"""
import json
import math
import re
import struct
import sys

# Flags de formato de Godot 3 (VisualServer::ArrayFormat)
F_VERTEX, F_NORMAL, F_TANGENT, F_COLOR, F_UV, F_UV2 = 1, 2, 4, 8, 16, 32
C_NORMAL, C_TANGENT, C_COLOR, C_UV, C_UV2 = 1 << 10, 1 << 11, 1 << 12, 1 << 13, 1 << 14
OCTAEDRAL = 1 << 21


def bytes_de(texto, clave):
    m = re.search(r'"%s": PoolByteArray\(([^)]*)\)' % clave, texto)
    return bytes(int(x) for x in m.group(1).split(','))


def oct_a_normal(x, y):
    z = 1 - (abs(x) + abs(y))
    t = max(-z, 0.0)
    x += -t if x >= 0 else t
    y += -t if y >= 0 else t
    n = math.sqrt(x * x + y * y + z * z) or 1
    return x / n, y / n, z / n


def s8(b):
    return max(-1.0, (b - 256 if b > 127 else b) / 127.0)


def convertir(ruta_tscn, ruta_png, ruta_glb):
    texto = open(ruta_tscn).read()
    fmt = int(re.search(r'"format": (\d+)', texto).group(1))
    nv = int(re.search(r'"vertex_count": (\d+)', texto).group(1))
    datos = bytes_de(texto, 'array_data')
    indices = bytes_de(texto, 'array_index_data')

    assert fmt & F_VERTEX and fmt & OCTAEDRAL, 'formato no soportado'
    stride = len(datos) // nv
    pos, nor, uv = [], [], []
    for i in range(nv):
        o = i * stride
        x, y, z = struct.unpack_from('<3f', datos, o)
        o += 12
        pos += [x, y, z]
        if fmt & F_NORMAL:
            nor += oct_a_normal(s8(datos[o]), s8(datos[o + 1]))
            o += 2 if fmt & C_NORMAL else 12
        if fmt & F_TANGENT:
            o += 2 if fmt & C_TANGENT else 16
        if fmt & F_COLOR:
            o += 4 if fmt & C_COLOR else 16
        if fmt & F_UV:
            if fmt & C_UV:
                u, v = struct.unpack_from('<2e', datos, o)
                o += 4
            else:
                u, v = struct.unpack_from('<2f', datos, o)
                o += 8
            uv += [u, v]

    mn = [min(pos[k::3]) for k in range(3)]
    mx = [max(pos[k::3]) for k in range(3)]
    png = open(ruta_png, 'rb').read()

    # Godot guarda los triángulos en sentido horario; glTF los quiere
    # antihorarios, así que se invierte cada terna.
    idx = list(struct.unpack('<%dH' % (len(indices) // 2), indices))
    for t in range(0, len(idx), 3):
        idx[t + 1], idx[t + 2] = idx[t + 2], idx[t + 1]

    partes, vistas = [], []

    def agregar(blob, target=None):
        desplaz = sum(len(p) for p in partes)
        relleno = (-len(blob)) % 4
        partes.append(blob + b'\0' * relleno)
        vista = {'buffer': 0, 'byteOffset': desplaz, 'byteLength': len(blob)}
        if target:
            vista['target'] = target
        vistas.append(vista)
        return len(vistas) - 1

    v_pos = agregar(struct.pack('<%df' % len(pos), *pos), 34962)
    v_nor = agregar(struct.pack('<%df' % len(nor), *nor), 34962)
    v_uv = agregar(struct.pack('<%df' % len(uv), *uv), 34962)
    v_idx = agregar(struct.pack('<%dH' % len(idx), *idx), 34963)
    v_img = agregar(png)

    gltf = {
        'asset': {'version': '2.0', 'generator': 'tscn_a_glb.py (Quaternius CC0)'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': [{
            'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2},
            'indices': 3, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {
            'baseColorTexture': {'index': 0}, 'metallicFactor': 0.3, 'roughnessFactor': 0.6}}],
        'textures': [{'source': 0, 'sampler': 0}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
        'images': [{'bufferView': v_img, 'mimeType': 'image/png'}],
        'accessors': [
            {'bufferView': v_pos, 'componentType': 5126, 'count': nv, 'type': 'VEC3', 'min': mn, 'max': mx},
            {'bufferView': v_nor, 'componentType': 5126, 'count': nv, 'type': 'VEC3'},
            {'bufferView': v_uv, 'componentType': 5126, 'count': nv, 'type': 'VEC2'},
            {'bufferView': v_idx, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'},
        ],
        'bufferViews': vistas,
    }
    binario = b''.join(partes)
    gltf['buffers'] = [{'byteLength': len(binario)}]
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(binario)
    with open(ruta_glb, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(binario), 0x004E4942) + binario)
    print('%s: %d vértices, %d triángulos, %.0f KB' % (ruta_glb, nv, len(idx) // 3, total / 1024))


if __name__ == '__main__':
    convertir(*sys.argv[1:4])

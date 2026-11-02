#!/usr/bin/env python3
"""Servidor local del juego sin caché: así cada recarga trae los archivos
actuales (el http.server común deja que el navegador reutilice módulos
viejos). Uso: python3 herramientas/servidor.py [puerto]"""
import http.server
import os
import sys


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    # Herramienta de desarrollo: el juego puede guardar una captura como
    # assets/img/<nombre>.jpg (ver __flotas.capturar en js/main.js). Solo
    # acepta pedidos desde esta misma computadora.
    # También guarda audio decodificado por el navegador como
    # descargas/wav/<nombre>.wav (para pasar .ogg a .m4a con afconvert).
    def do_POST(self):
        carpeta, ext = ('assets/img', '.jpg')
        if self.path.startswith('/__audio/'):
            carpeta, ext = ('descargas/wav', '.wav')
        nombre = self.path.split('/')[-1]
        if self.client_address[0] not in ('127.0.0.1', '::1') or not nombre.replace('-', '').replace('_', '').isalnum():
            self.send_error(403)
            return
        datos = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(carpeta, nombre + ext), 'wb') as f:
            f.write(datos)
        self.send_response(204)
        self.end_headers()


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'FNOVA Flotas en http://localhost:{puerto}')
    http.server.ThreadingHTTPServer(('', puerto), SinCache).serve_forever()

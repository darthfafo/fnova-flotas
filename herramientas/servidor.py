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


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'FNOVA Flotas en http://localhost:{puerto}')
    http.server.ThreadingHTTPServer(('', puerto), SinCache).serve_forever()

#!/bin/bash
# Doble clic en Mac: levanta un servidor local y abre el juego.
cd "$(dirname "$0")"
(sleep 1 && open "http://localhost:8765") &
python3 herramientas/servidor.py 8765

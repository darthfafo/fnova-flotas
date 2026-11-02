@echo off
rem Doble clic en Windows: levanta un servidor local y abre el juego.
cd /d "%~dp0"
start "" http://localhost:8765
python herramientas\servidor.py 8765 || py herramientas\servidor.py 8765

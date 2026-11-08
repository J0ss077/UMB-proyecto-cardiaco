"""@requirement RF-04

Ingesta de lecturas desde dispositivos de presión arterial.

Expone el servicio que guarda el mensaje crudo y la lectura validada, y el
router con el endpoint ``POST /api/ingest/readings``. La ruta se autentica con
la clave compartida ``X-Device-Key`` y no con una sesión: el dispositivo no es
una persona y no tiene rol en la plataforma.
"""

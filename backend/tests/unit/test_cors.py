"""@requirement none

Pruebas unitarias de los orígenes que CORS permite a la interfaz web.

La función que decide la lista es pura: recibe la configuración y devuelve los
orígenes, sin levantar la aplicación ni leer variables de entorno.
"""

from types import SimpleNamespace

from hta.api.cors import allowed_origins


def test_allowed_origins_parses_the_list():
    settings = SimpleNamespace(allowed_origins="http://localhost:5173, http://localhost:3000")
    assert allowed_origins(settings) == ["http://localhost:5173", "http://localhost:3000"]


def test_allowed_origins_defaults_when_empty():
    settings = SimpleNamespace(allowed_origins="")
    assert allowed_origins(settings) == ["http://localhost:5173", "http://localhost:3000"]

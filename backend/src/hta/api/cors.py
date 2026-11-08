"""@requirement none

Orígenes de confianza que CORS permite al navegador de la interfaz web.

El navegador bloquea la lectura de una respuesta de otro origen si la API no
declara ese origen en la respuesta. La lista llega de la configuración como
texto separado por comas y se limpia en una función pura, para poder probarla
sin levantar la aplicación ni leer variables de entorno.

La sesión viaja en el encabezado ``Authorization``, no en una cookie, así que
la política no habilita credenciales: el navegador no tiene cookies que enviar.
"""

from __future__ import annotations

from hta.config import Settings

# Puertos de desarrollo de la interfaz web: el 5173 que Vite usa por omisión y
# el 3000 del servidor de ejemplo del repositorio. Son solo el valor por
# omisión de la configuración local; el despliegue declara los suyos.
DEFAULT_ORIGINS = ("http://localhost:5173", "http://localhost:3000")


def allowed_origins(settings: Settings) -> list[str]:
    """Devuelve los orígenes permitidos, o los de desarrollo si no hay ninguno.

    La lista configurada se parte por coma y se recorta por origen; los tramos
    vacíos se descartan. Una lista sin entradas útiles no se interpreta como
    "todo permitido": se cae a los orígenes de desarrollo.
    """
    origins = [origin.strip() for origin in settings.allowed_origins.split(",")]
    return [origin for origin in origins if origin] or list(DEFAULT_ORIGINS)

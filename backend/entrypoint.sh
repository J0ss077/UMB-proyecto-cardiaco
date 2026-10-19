#!/bin/sh
# Entrada del contenedor del backend: espera a PostgreSQL, aplica las
# migraciones del registro clínico y arranca la API.
#
# La migración es obligatoria y sus dos fallos se distinguen:
#   - hta.db.migrate no existe: código 1, con un mensaje que nombra la tarea
#     que lo implementa.
#   - hta.db.migrate existe pero falla al importarse o al ejecutarse: código 2,
#     con su propia traza en stderr.
# La existencia se consulta con importlib.util.find_spec, que devuelve None sin
# ejecutar el módulo; así una ausencia no se puede confundir con un error de
# importación. La importación real va después y no silencia stderr.

set -eu

: "${HTA_DATABASE_URL:?HTA_DATABASE_URL no está definida}"
: "${HTA_MONGO_URL:?HTA_MONGO_URL no está definida}"
: "${HTA_JWT_SECRET:?HTA_JWT_SECRET no está definida}"

INTENTOS_POSTGRES="${HTA_POSTGRES_WAIT_ATTEMPTS:-30}"
SEGUNDOS_ENTRE_INTENTOS="${HTA_POSTGRES_WAIT_SECONDS:-2}"

esperar_postgres() {
    intento=1
    while [ "$intento" -le "$INTENTOS_POSTGRES" ]; do
        if python - "$HTA_DATABASE_URL" <<'PY'
import sys

import psycopg

try:
    with psycopg.connect(sys.argv[1], connect_timeout=2) as conexion:
        conexion.execute("SELECT 1")
except psycopg.Error:
    raise SystemExit(1)
PY
        then
            echo "PostgreSQL está listo."
            return 0
        fi
        echo "Esperando a PostgreSQL ($intento/$INTENTOS_POSTGRES)..."
        intento=$((intento + 1))
        sleep "$SEGUNDOS_ENTRE_INTENTOS"
    done
    return 1
}

if ! esperar_postgres; then
    echo "Error: PostgreSQL no respondió en el tiempo de espera." >&2
    exit 1
fi

# ¿Existe hta.db.migrate? Se consulta el especificador del módulo, que no lo
# ejecuta. Códigos: 0 existe, 1 no existe, 2 el paquete hta.db está roto.
estado_modulo=0
python - <<'PY' || estado_modulo=$?
import importlib.util
import sys
import traceback

MODULO = "hta.db.migrate"

try:
    especificacion = importlib.util.find_spec(MODULO)
except ModuleNotFoundError as error:
    # Solo la ausencia del propio módulo o de un paquete que lo contiene
    # significa que no existe. La ausencia de cualquier otra dependencia que
    # hta.db importe deja el paquete roto y su traza debe verse.
    nombre = error.name or ""
    if nombre and (MODULO == nombre or MODULO.startswith(nombre + ".")):
        sys.exit(1)
    traceback.print_exc()
    sys.exit(2)
except Exception:
    traceback.print_exc()
    sys.exit(2)

sys.exit(0 if especificacion is not None else 1)
PY

if [ "$estado_modulo" -eq 1 ]; then
    echo "Error: el módulo hta.db.migrate no existe y la migración es obligatoria." >&2
    echo "La migración del registro clínico llega en la tarea 5 del plan." >&2
    exit 1
fi

if [ "$estado_modulo" -ne 0 ]; then
    echo "Error: el paquete hta.db no se pudo importar; el contenedor no arranca." >&2
    exit 2
fi

# El módulo existe: importarlo y ejecutarlo. Un fallo aquí conserva su propia
# traza y sale con un código distinto del de la ausencia.
estado_migracion=0
python -m hta.db.migrate || estado_migracion=$?
if [ "$estado_migracion" -ne 0 ]; then
    echo "Error: hta.db.migrate existe pero falló con código $estado_migracion; el contenedor no arranca." >&2
    exit 2
fi

exec uvicorn hta.app:create_app --factory --host 0.0.0.0 --port 8000

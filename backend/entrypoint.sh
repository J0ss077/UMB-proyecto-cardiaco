#!/bin/sh
# Entrada del contenedor del backend: espera a PostgreSQL, aplica las
# migraciones del registro clínico y arranca la API.
#
# La migración es obligatoria por omisión: si el módulo no existe o la
# migración falla, el contenedor sale con código distinto de cero para que el
# fallo sea visible. Mientras `hta.db.migrate` no exista (llega en la tarea 5
# del plan), el compose declara HTA_MIGRATIONS_OPTIONAL=1 y el entrypoint avisa
# y continúa, de modo que la pila se pueda levantar y probar antes de esa
# tarea. La bandera se retira cuando la migración esté implementada.

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

if python -c 'import importlib.util, sys; sys.exit(0 if importlib.util.find_spec("hta.db.migrate") is not None else 1)' 2>/dev/null; then
    if ! python -m hta.db.migrate; then
        echo "Error: la migración del registro clínico falló; el contenedor no arranca." >&2
        exit 1
    fi
else
    if [ "${HTA_MIGRATIONS_OPTIONAL:-0}" != "1" ]; then
        echo "Error: el módulo hta.db.migrate no existe y la migración es obligatoria." >&2
        echo "La migración del registro clínico llega en la tarea 5 del plan." >&2
        exit 1
    fi
    echo "Aviso: hta.db.migrate no existe todavía; no se aplican migraciones." >&2
    echo "Aviso: HTA_MIGRATIONS_OPTIONAL=1 es temporal y se retira con la tarea 5." >&2
fi

exec uvicorn hta.app:create_app --factory --host 0.0.0.0 --port 8000

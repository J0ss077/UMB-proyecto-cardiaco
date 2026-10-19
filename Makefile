# Puntos de entrada del proyecto.
#
# Las tareas siguientes amplían estos objetivos; ninguno se reescribe desde cero.
# Los objetivos que usan contenedores detectan podman-compose y, si no está,
# caen a docker compose. Ningún objetivo hace silenciosamente nada: si la pieza
# que necesita todavía no existe, se detiene con un mensaje y código de salida 2.
#
# El objetivo por omisión es `help`, que no depende de la capa de agente: el
# proyecto se puede usar con `.agents/` borrado.

SHELL := /bin/sh
.DEFAULT_GOAL := help

PYTHON ?= python3

# El archivo .env es la única fuente de secretos y credenciales de la pila. Se
# incluye si existe para que `make` y `psql` vean lo mismo que el compose; si
# falta, los objetivos que lo necesitan se detienen con un mensaje claro.
# El archivo usa líneas simples CLAVE=valor, sin `export` ni comillas.
-include .env

POSTGRES_HOST ?= localhost
POSTGRES_PORT ?= 5432
BACKEND_PORT ?= 8000

# Las pruebas de integración hablan con el backend publicado. Se atan al mismo
# puerto que publica el compose para que cambiar BACKEND_PORT no las desvíe a
# otra pila que ya estuviera escuchando en el puerto por omisión.
API_BASE_URL ?= http://localhost:$(BACKEND_PORT)
export API_BASE_URL

ifneq ($(strip $(POSTGRES_USER)),)
HTA_DATABASE_URL := postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@$(POSTGRES_HOST):$(POSTGRES_PORT)/$(POSTGRES_DB)
export HTA_DATABASE_URL
endif

# Detección perezosa: solo se evalúa en los objetivos que usan contenedores, de
# modo que `make brief` funciona sin motor de contenedores instalado.
COMPOSE = $(shell if command -v podman-compose >/dev/null 2>&1; then echo podman-compose; elif docker compose version >/dev/null 2>&1; then echo "docker compose"; fi)

define require_compose
	@if [ -z "$(COMPOSE)" ]; then \
		echo "Error: no se encontró podman-compose ni docker compose."; \
		echo "Instala uno de los dos y vuelve a intentarlo."; \
		exit 2; \
	fi
	@if [ ! -f compose.yaml ]; then \
		echo "Error: compose.yaml no existe todavía."; \
		echo "Llega con la tarea que define los servicios."; \
		exit 2; \
	fi
endef

.PHONY: help up down logs test migrate seed brief check docs

help:
	@echo "Objetivos disponibles:"
	@echo "  make help     Muestra esta ayuda."
	@echo "  make brief    Imprime el estado, el backlog y el mapa de la capa de agente."
	@echo "  make up       Levanta los servicios y espera a que la API responda."
	@echo "  make down     Detiene los servicios."
	@echo "  make logs     Sigue los registros de los servicios."
	@echo "  make migrate  Aplica las migraciones del registro clínico."
	@echo "  make seed     Siembra los datos de demostración."
	@echo "  make test     Corre las pruebas unitarias y de integración."
	@echo "  make check    Corre autoría, estilo y pruebas."
	@echo "  make docs     Genera el mapa de trazabilidad y la matriz de estado."

brief:
	@if [ ! -d .agents ]; then \
		echo "La capa de agente no está instalada: no existe .agents/."; \
		exit 0; \
	fi; \
	if [ -f .agents/STATE.md ]; then \
		echo "== Estado =="; \
		cat .agents/STATE.md; \
		echo; \
	fi; \
	if [ -f .agents/BACKLOG.md ]; then \
		echo "== Backlog =="; \
		cat .agents/BACKLOG.md; \
		echo; \
	fi; \
	if [ -f .agents/MAP.md ]; then \
		echo "== Mapa =="; \
		cat .agents/MAP.md; \
	else \
		echo "== Mapa =="; \
		echo "El mapa no existe todavía: se genera con 'make docs'."; \
	fi

up:
	$(require_compose)
	$(COMPOSE) up -d --build
	@if ! command -v curl >/dev/null 2>&1; then \
		echo "Aviso: curl no está instalado; no se espera la salud del backend."; \
		exit 0; \
	fi; \
	echo "Esperando a que el backend responda en http://localhost:$(BACKEND_PORT)/api/health ..."; \
	intento=0; \
	while [ $$intento -lt 30 ]; do \
		if curl -fsS http://localhost:$(BACKEND_PORT)/api/health 2>/dev/null | grep -q '"status":"ok"'; then \
			echo "Backend listo: la salud responde ok."; \
			exit 0; \
		fi; \
		intento=$$((intento + 1)); \
		sleep 2; \
	done; \
	echo "El backend no alcanzó un estado saludable en 60 segundos."; \
	$(COMPOSE) logs --tail=80 backend; \
	exit 1

down:
	$(require_compose)
	$(COMPOSE) down --remove-orphans

logs:
	$(require_compose)
	$(COMPOSE) logs --follow --tail=200

test:
	@if [ ! -f backend/pyproject.toml ]; then \
		echo "Error: backend/pyproject.toml no existe todavía."; \
		echo "Las pruebas llegan con el esqueleto del backend."; \
		exit 2; \
	fi
	cd backend && $(PYTHON) -m pytest tests/unit -v
	cd backend && $(PYTHON) -m pytest tests/integration -v

migrate:
	$(require_compose)
	@echo "Aplicando las migraciones del registro clínico..."
	$(COMPOSE) exec -T backend python -m hta.db.migrate

seed:
	$(require_compose)
	$(COMPOSE) exec -T backend python -m hta.db.seed

check:
	@if [ ! -f scripts/check_authorship.py ] || [ ! -f scripts/check_style.py ]; then \
		echo "Error: faltan los verificadores de autoría o de estilo."; \
		echo "Llegan con la tarea que los implementa."; \
		exit 2; \
	fi
	$(PYTHON) scripts/check_authorship.py --root .
	$(PYTHON) scripts/check_style.py --root .
	$(MAKE) test

docs:
	@if [ ! -f scripts/build_map.py ] || [ ! -f scripts/build_status.py ]; then \
		echo "Error: faltan el generador del mapa o el de la matriz de estado."; \
		echo "Llegan con la tarea que los implementa."; \
		exit 2; \
	fi
	$(PYTHON) scripts/build_map.py --root . --out .agents/MAP.md --status-out docs/estado-requerimientos.md

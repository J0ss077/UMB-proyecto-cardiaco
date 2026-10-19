# Puntos de entrada del proyecto.
#
# Las tareas siguientes amplían estos objetivos; ninguno se reescribe desde cero.
# Los objetivos que usan contenedores detectan podman-compose y, si no está,
# caen a docker compose. Ningún objetivo hace silenciosamente nada: si la pieza
# que necesita todavía no existe, se detiene con un mensaje y código de salida 2.

SHELL := /bin/sh
.DEFAULT_GOAL := brief

PYTHON ?= python3

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

.PHONY: up down logs test migrate seed brief check docs

brief:
	@if [ ! -f .agents/STATE.md ] || [ ! -f .agents/BACKLOG.md ]; then \
		echo "Error: faltan .agents/STATE.md o .agents/BACKLOG.md."; \
		exit 2; \
	fi
	@echo "== Estado =="
	@cat .agents/STATE.md
	@echo
	@echo "== Backlog =="
	@cat .agents/BACKLOG.md
	@echo
	@if [ -f .agents/MAP.md ]; then \
		echo "== Mapa =="; \
		cat .agents/MAP.md; \
	else \
		echo "== Mapa =="; \
		echo "El mapa no existe todavía: se genera con 'make docs' cuando el generador esté disponible."; \
	fi

up:
	$(require_compose)
	$(COMPOSE) up -d --build

down:
	$(require_compose)
	$(COMPOSE) down

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
	@if [ ! -f scripts/build_map.py ]; then \
		echo "Error: scripts/build_map.py no existe todavía."; \
		echo "El mapa de trazabilidad y la matriz de estado llegan con el generador."; \
		exit 2; \
	fi
	$(PYTHON) scripts/build_map.py --root . --out .agents/MAP.md --status-out docs/estado-requerimientos.md

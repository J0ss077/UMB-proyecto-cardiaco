# Estado del proyecto

Fecha de actualización: 2026-10-18

Este archivo se lee al empezar cada sesión y se actualiza al cerrarla. El comando `make brief` imprime este estado, el backlog y el mapa de trazabilidad en una pantalla.

## Terminado

- Repositorio nuevo con historial de git y rama de trabajo `incremento-1`. El diseño, el plan del incremento y las investigaciones están versionados en `docs/superpowers/` y `docs/research/`.
- Esqueleto del repositorio: `.gitignore`, `README.md`, `AGENTS.md`, `Makefile` con los objetivos `up`, `down`, `logs`, `test`, `migrate`, `seed`, `brief`, `check` y `docs`, capa de agente en `.agents/` y flujo de integración continua en `.github/workflows/ci.yml`.

## En curso

- Ninguno.

## Siguiente paso

- Tarea 2 del plan del incremento: `scripts/check_authorship.py` y `scripts/check_style.py` con sus pruebas, para que `make check` deje de detenerse en los verificadores ausentes.
- Después, el esqueleto del backend y el compose de PostgreSQL y MongoDB, que son lo que hace ejecutables los demás objetivos.

### Bloqueos

- Firma clínica de los umbrales de `alert_config`: mientras no exista, RF-10 y RF-14 quedan en parcial y cada alerta indica que la configuración está pendiente de validación.
- Elección del banco de datos público para el adaptador de modelo: sin él, RF-09 se sostiene con reglas y el adaptador de modelo queda parcial. Fecha de corte: 30 de noviembre de 2026.

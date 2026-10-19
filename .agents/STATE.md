# Estado del proyecto

Fecha de actualización: 2026-10-18

Este archivo se lee al empezar cada sesión y se actualiza al cerrarla. El comando `make brief` imprime este estado, el backlog y el mapa de trazabilidad en una pantalla.

## Terminado

- Repositorio nuevo con historial de git y rama de trabajo `incremento-1`. El diseño, el plan del incremento y las investigaciones están versionados en `docs/superpowers/` y `docs/research/`.
- Esqueleto: `.gitignore`, `README.md`, `AGENTS.md`, `Makefile` con los objetivos `up`, `down`, `logs`, `test`, `migrate`, `seed`, `brief`, `check`, `docs` y `help`, capa de agente en `.agents/` e integración continua en `.github/workflows/ci.yml`.
- Verificadores de autoría y de estilo, con sus pruebas y conectados a `make check`.
- Backend FastAPI con configuración validada, fábrica de aplicación, endpoint de salud que reporta el estado real de PostgreSQL y MongoDB, y el ADR del stack en `docs/adr/0001-python-fastapi-stack.md`.
- Pila de contenedores: PostgreSQL 16, MongoDB 7, backend y web, con espera activa a la base y migraciones aplicadas al arrancar.
- Esquema clínico completo: dieciséis tablas, siete enumerados, las dos columnas `critical_low` y `critical_high` en `alert_config`, diccionario de datos en `docs/manual/modelo-de-datos.md` y ADR en `docs/adr/0002-alert-config-critical-thresholds.md`.
- Colecciones `raw_readings` y `wearable_events` con sus índices, creadas tanto por el script del volumen como por el arranque del backend, para que un volumen ya inicializado no deje la pila sana sin flujo crudo.
- Primitivas de autenticación: hash scrypt con parámetros almacenados, tokens de acceso JWT verificados y tokens de refresco con solo su hash guardado. La configuración rechaza una clave de firma de ejemplo o menor de 32 bytes.

## En curso

- Ninguno. La tarea 7 cerró con la revisión limpia.

## Siguiente paso

- Tarea 8 del plan del incremento: inicio de sesión, rotación de token de refresco con detección de reutilización, cierre de sesión y auditoría de cada acceso. Depende de las primitivas ya terminadas y del esquema ya aplicado.

## Bloqueos

- Firma clínica de los umbrales de `alert_config`: mientras no exista, RF-10 y RF-14 quedan en parcial y cada alerta indica que la configuración está pendiente de validación.
- Elección del banco de datos público para el adaptador de modelo: sin él, RF-09 se sostiene con reglas y el adaptador de modelo queda parcial. Fecha de corte: 30 de noviembre de 2026.

## Notas operativas

- El backend se niega a arrancar si `HTA_JWT_SECRET` conserva el valor de ejemplo. El `README.md` explica cómo generar uno.
- `manual-tecnico-v02.pdf` está en la carpeta y no se versiona todavía: es el manual actualizado que aporta el socio. Conserva las mismas dieciséis tablas y los mismos siete enumerados que la versión anterior.
- La sección 2.2 del manual sigue sin las dos columnas críticas ni las tres acciones de borrado explícitas. El diccionario del repositorio ya las tiene y es una de las entregas en Markdown pendientes para el documento académico.
- Las tareas 8 a 13 del plan siguen abiertas. El detalle de lo hecho, las decisiones tomadas y los hallazgos menores diferidos vive en el registro del plan, junto al plan mismo.

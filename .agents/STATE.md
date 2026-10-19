# Estado del proyecto

Fecha de actualización: 2026-10-19

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
- Sesión completa: inicio de sesión con mensaje único, rotación del token de refresco con detección de reutilización y revocación de toda la cuenta, cierre de sesión idempotente y auditoría de los cinco eventos. El grupo de conexiones se abre y se cierra con el ciclo de vida de la aplicación.
- Cuentas: registro público de pacientes, capa de autorización con `current_user` y `require_role`, cambio de rol por administración, y desactivación que seudonimiza la identidad, revoca los refrescos y conserva la historia clínica.
- Consentimiento versionado: aceptación aditiva, revocación que cierra todas las aceptaciones vigentes y `is_active` como compuerta del monitoreo.
- Trazabilidad generada: catálogo canónico de los 47 requerimientos en `docs/manual/requerimientos.md`, `scripts/build_map.py` que produce `.agents/MAP.md` desde las anotaciones y `scripts/build_status.py` que produce `docs/estado-requerimientos.md` cruzando el catálogo con esas anotaciones. `make docs` regenera los dos; una anotación que nombre un requerimiento ausente del catálogo detiene la generación con código 1.

## En curso

- Ninguno. La tarea 12 cerró con las pruebas de los generadores, los verificadores y la suite unitaria del backend en verde. La suite de integración del backend no se corrió en esa tarea: vacía las tablas mutables y los datos de demostración, y queda para la verificación de la tarea 13.

## Siguiente paso

- Tarea 13: verificación en un clon limpio, `docs/manual/entrega-01.md` y cierre del incremento.

## Bloqueos

- Firma clínica de los umbrales de `alert_config`: mientras no exista, RF-10 y RF-14 no podrán pasar de parciales cuando se implementen y cada alerta indicará que la configuración está pendiente de validación.
- Elección del banco de datos público para el adaptador de modelo: sin él, RF-09 se sostendrá con reglas y el adaptador de modelo quedará parcial. Fecha de corte: 30 de noviembre de 2026.

## Notas operativas

- El backend se niega a arrancar si `HTA_JWT_SECRET` conserva el valor de ejemplo. El `README.md` explica cómo generar uno.
- El contenedor del backend no recarga código: después de modificarlo hay que reiniciarlo. Mientras tanto, las pruebas de integración aceptan `API_BASE_URL` para apuntar a un backend levantado en el host.
- Las pruebas de integración vacían todas las tablas mutables entre una prueba y la siguiente, así que una base sembrada queda vacía después de correrlas. La siembra es idempotente por correo y se repite con `make seed`.
- `manual-tecnico-v02.pdf` está en la carpeta y no se versiona todavía: es el manual actualizado que aporta el socio. Conserva las mismas dieciséis tablas y los mismos siete enumerados que la versión anterior.
- La sección 2.2 del manual sigue sin las dos columnas críticas ni las tres acciones de borrado explícitas. El diccionario del repositorio ya las tiene y es una de las entregas en Markdown pendientes para el documento académico.
- El estado de un requerimiento se escribe una sola vez, en `docs/manual/requerimientos.md`; `.agents/MAP.md` y `docs/estado-requerimientos.md` son vistas generadas y no se editan a mano. El generador rechaza un estado `Implementado` sin ninguna anotación que lo respalde y un estado `Parcial` sin `**Motivo:**`.
- La tarea 13 del plan sigue abierta. El detalle de lo hecho, las decisiones tomadas y los hallazgos menores diferidos vive en el registro del plan, junto al plan mismo.

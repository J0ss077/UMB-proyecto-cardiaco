# Estado del proyecto

Fecha de actualización: 2026-10-19

Este archivo se lee al empezar cada sesión y se actualiza al cerrarla. El comando `make brief` imprime este estado, el backlog y el mapa de trazabilidad en una pantalla.

## Terminado

- **Incremento 1 cerrado.** Las trece tareas del plan están implementadas, revisadas y en la rama `incremento-1`. El paquete de la revisión del 2 de noviembre de 2026 es `docs/manual/entrega-01.md`.
- Repositorio con historial, rama de trabajo y `main` que solo contiene documentos. Diseño, plan e investigaciones en `docs/superpowers/` y `docs/research/`.
- Esqueleto: `README.md`, `AGENTS.md`, `.gitignore`, `Makefile` con diez objetivos, capa de agente en `.agents/` e integración continua que corre autoría, estilo, unitarias e integración.
- Verificadores de autoría y de estilo con sus pruebas, conectados a `make check`.
- Backend FastAPI con configuración validada, fábrica de aplicación y salud que informa PostgreSQL y MongoDB por separado. El ADR del stack es `docs/adr/0001-python-fastapi-stack.md`.
- Pila de contenedores con PostgreSQL 16, MongoDB 7, backend y web; las migraciones se aplican al arrancar y las colecciones del flujo crudo se garantizan en el mismo arranque. Los cuatro puertos se cambian desde `.env`.
- Esquema clínico completo: dieciséis tablas, siete enumerados, las dos columnas `critical_low` y `critical_high` en `alert_config`, diccionario en `docs/manual/modelo-de-datos.md` y ADR en `docs/adr/0002-alert-config-critical-thresholds.md`.
- Sesión: inicio con mensaje único, rotación del refresco con detección de reutilización y revocación de toda la cuenta, cierre idempotente y auditoría de cinco eventos. El grupo de conexiones se abre y se cierra con el ciclo de vida de la aplicación.
- Cuentas: registro público de pacientes, autorización por rol con la base como autoridad, cambio de rol y desactivación que seudonimiza, revoca los refrescos y conserva la historia clínica.
- Consentimiento versionado con aceptación aditiva, revocación que cierra todas las vigencias e `is_active` como compuerta del monitoreo.
- Datos de demostración: siete cuentas, cuatro escenarios, ochenta lecturas deterministas, alerta crítica abierta, vínculo de cuidador, recordatorios y dos filas de umbrales. Documento para personas en `docs/manual/cuentas-demo.md`.
- Trazabilidad generada: catálogo de 47 requerimientos en `docs/manual/requerimientos.md`, mapa en `.agents/MAP.md` y matriz de estado en `docs/estado-requerimientos.md`, todo con `make docs`.
- Diagramas UML del manual en `docs/manual/diagramas-uml.md`: clases, estados por clase, colaboración y secuencia de los doce casos de uso, componentes y distribución, en PlantUML. Los treinta y siete bloques compilan con el verificador de PlantUML.
- Verificación del clon limpio ejecutada: clon nuevo, `.env` desde el ejemplo, pila en puertos alternos, siembra, siete cuentas por la API, esquema inspeccionado desde fuera y las dos suites en verde contra esa pila. El procedimiento está en el `README.md`.

## En curso

- Ninguno. El incremento 1 cerró y la rama espera la revisión final y la integración a `main`.

## Siguiente paso

- Planificar el incremento 2: lecturas, síntomas, ingesta desde el simulador y tableros de paciente y médico. La compuerta de consentimiento ya existe y debe consultarse en cada ruta que toque datos clínicos; la validación fisiológica de las lecturas vive en la aplicación, no en la base.
- Antes de tocar código, leer `docs/manual/requerimientos.md` para los requerimientos que abre el incremento y `.agents/BACKLOG.md` para lo que quedó pendiente.

## Bloqueos

- **Firma clínica de los umbrales de `alert_config`.** Fecha de corte: 30 de noviembre de 2026. Mientras no exista, RF-10 y RF-14 no se presentan como evidencia clínica y los umbrales sembrados son una propuesta documentada.
- **Elección del banco de datos público para el adaptador de modelo.** Fecha de corte: 30 de noviembre de 2026. Sin elección, RF-09 se sostiene con reglas y el adaptador queda parcial.

## Notas operativas

- El backend se niega a arrancar si `HTA_JWT_SECRET` conserva el valor de ejemplo o mide menos de 32 bytes. El `README.md` explica cómo generar uno.
- El contenedor del backend no recarga código: después de modificarlo hay que reiniciarlo. Mientras tanto, las pruebas de integración aceptan `API_BASE_URL` para apuntar a un backend levantado en el host.
- Las pruebas de integración vacían todas las tablas mutables entre una prueba y la siguiente, así que una base sembrada queda vacía después de correrlas. La siembra es idempotente por correo y se repite con `make seed`.
- La siembra no mueve datos existentes: un paciente que ya tiene lecturas no recibe más. Para regenerar los datos hay que borrar los volúmenes y volver a levantar la pila, como explica `docs/manual/cuentas-demo.md`.
- Los cuatro documentos fuente del socio están en `docs/fuentes/`, versionados y fuera de la raíz: la primera y la segunda versión del manual técnico y las dos documentaciones de semestre. El v02 conserva las mismas dieciséis tablas y los mismos siete enumerados que el v01.
- La sección 2.2 del manual sigue sin las dos columnas críticas ni las tres acciones de borrado explícitas. El diccionario del repositorio ya las tiene y es una de las entregas en Markdown pendientes para el documento académico.
- Los hallazgos menores diferidos de este incremento quedaron en `.agents/BACKLOG.md`. La carpeta de trabajo del plan era material de agente y no se conserva.

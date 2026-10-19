# Protocolo de trabajo para agentes

Primera lectura de toda sesión. Es corto a propósito: las invariantes no cambian y lo que cambia vive en `.agents/`.

## Qué es el proyecto

Plataforma de telemonitoreo para pacientes con hipertensión arterial, prototipo de grado en Ingeniería de Software de la Universidad Manuela Beltrán.
Incluye registro domiciliario de presión arterial, consentimiento informado, alertas con validación médica y un modelo de IA de apoyo a la decisión que estima la probabilidad de descontrol tensional.
No diagnostica ni trata: ninguna alerta se cierra sin una persona.

## Orden de lectura al empezar una sesión

1. `AGENTS.md`, este archivo.
2. `.agents/STATE.md`: qué está terminado, qué está en curso, el siguiente paso y los bloqueos.
3. `.agents/BACKLOG.md`: trabajo pendiente con su requerimiento y su estado.
4. `.agents/MAP.md`: mapa de requerimiento a archivos y pruebas. Se genera; nunca se escribe a mano. Si no existe, el generador todavía no está y se deja como está.

Al cerrar la sesión se actualiza `.agents/STATE.md`. Un estado que no está en un archivo del repositorio no existe.

## Reglas duras

- Sin emojis en archivos, confirmaciones, mensajes de interfaz ni mensajes de error. Los estados se escriben con palabras.
- La documentación del repositorio va en español; los identificadores de código, los nombres de tablas y los asuntos de confirmación van en inglés.
- Ningún artefacto de la capa humana declara ni insinúa autoría asistida por IA. Esa mención solo cabe en la capa de agente: `AGENTS.md`, `.agents/` y `docs/superpowers/`. La palabra "IA" es legítima cuando nombra el producto.
- El registro relacional tiene dieciséis tablas con los nombres exactos del manual y siete tipos enumerados. No se añade una decimoséptima tabla: una necesidad nueva se resuelve dentro de las dieciséis.
- `alert_config` incluye dos columnas nullable aprobadas, `critical_low` y `critical_high`, porque el enum de severidad tiene cuatro niveles. Se justifican en un ADR.
- Identificadores UUID con `gen_random_uuid()`, marcas de tiempo `TIMESTAMPTZ` con `now()`, snake_case, tablas en plural, llave foránea con sufijo `_id` y acción de borrado explícita en toda relación.
- Ningún dato clínico se procesa sin consentimiento vigente.
- La IA no diagnostica ni trata y ninguna alerta se cierra de forma autónoma.
- La desactivación de una cuenta no borra historial clínico: seudonimiza la identidad, conserva los registros y revoca los tokens de refresco.
- Los valores fuera de rango se conservan con `validation_status = 'out_of_range'`; la validación fisiológica vive en la aplicación, no en la base de datos.
- Los umbrales clínicos viven en `alert_config`, se siembran con su fuente documentada y no cuentan como evidencia hasta que un clínico los firme.
- La imagen del backend fija Python 3.12, aunque el equipo tenga otra versión instalada.
- Las pruebas de integración corren contra el PostgreSQL y el MongoDB de la pila; las unitarias no tocan base de datos.
- Un hecho vive en un solo lugar: el estado de los requerimientos en el mapa generado, las decisiones en su ADR, los umbrales en la siembra. Un documento que repite un hecho está mal escrito.
- `.legacy-project/` es el proyecto anterior. No se lee, no se cita y no se usa como referencia de implementación; ninguna herramienta del proyecto lo recorre ni lo indexa.
- La capa de agente se puede borrar sin romper el proyecto: ningún artefacto humano depende de ella.

## Cómo se trabaja

- Una rama corta por unidad de trabajo, con el requerimiento o el caso de uso en el nombre; `main` siempre desplegable.
- Confirmaciones en formato convencional y en inglés. Nadie integra su propio trabajo sin revisión.
- Antes de cerrar: pruebas locales en verde y `.agents/STATE.md` actualizado.
- Lo declarado como pendiente no se anuncia como terminado, y un hueco se escribe en el manual en lugar de disimularse.

## Dónde vive cada cosa

| Ruta                | Contenido                                                                  |
| ------------------- | -------------------------------------------------------------------------- |
| `README.md`         | qué es el sistema y cómo se levanta, en una pantalla                       |
| `docs/`             | capa humana: manual, ADRs, contrato de la API, diagramas e investigaciones |
| `docs/superpowers/` | capa de agente: diseño, planes y notas de trabajo                          |
| `backend/`          | lógica clínica, autenticación, alertas, reportes y API                     |
| `web/`              | interfaz de paciente, médico, cuidador y administrador                     |
| `db/`               | migraciones del registro clínico y colecciones del flujo crudo             |
| `ml/`               | entrenamiento, evaluación y modelo serializado                             |
| `iot/`              | contrato de ingesta y simulador de dispositivo                             |
| `deploy/`           | imágenes y orquestación de los servicios                                   |
| `scripts/`          | generadores y verificadores ejecutables por personas                       |
| `.agents/`          | estado, backlog y mapa de trazabilidad: capa de agente                     |
| `.github/`          | integración continua                                                       |

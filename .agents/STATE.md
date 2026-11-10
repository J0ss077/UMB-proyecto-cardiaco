# Estado del proyecto

Fecha de actualización: 2026-11-10

Este archivo se lee al empezar cada sesión y se actualiza al cerrarla. El comando `make brief` imprime este estado, el backlog y el mapa de trazabilidad en una pantalla.

## Terminado

- **Incremento 1**: esquema clínico de dieciséis tablas y siete enumerados, pila de contenedores, sesión con rotación de refresco, cuentas y roles, consentimiento versionado y datos de demostración. El paquete de esa revisión es `docs/manual/entrega-01.md`.
- **Incremento 2 del backend**: contrato HTTP publicado en `docs/api/openapi.json` con su esquema de seguridad y su documento para el cliente; CORS por configuración; lectura con compuerta de consentimiento y validación fisiológica; directorio de pacientes, consultas paginadas y ventana domiciliaria de siete días; alertas con transiciones exclusivas del médico; ingesta de dispositivos con simulador.
- **Interfaz web** en `web/`: React 18, Vite 6, TypeScript estricto, Tailwind y Recharts, con modo claro y oscuro y diseño adaptable. Cómo trabajarla está en `web/README.md`. Pantallas por rol: paciente con inicio personalizable, datos y cuatro gráficas, registro de lectura y síntoma, perfil con foto y contacto, historial exportable a Excel y PDF, notificaciones en el navegador y ayuda con consultas; médico con inicio, pacientes, alertas con las tres transiciones y consultas; cuidador en solo lectura; administrador con cuentas, vínculos, umbrales y auditoría.
- **Consultas al médico**: el paciente las envía con su contexto clínico reciente; el médico responde con enlace de reunión o con un formato de chequeo, y la consulta recorre revisión, pendiente y completada. Seis migraciones y cinco ADR lo sostienen.
- **Perfil del personal y cambio de contraseña**: foto, datos profesionales y edición del propio perfil; el cambio de contraseña del médico y del cuidador queda pendiente de aprobación del administrador, que al aprobarlo cierra las sesiones de esa cuenta.
- **Autorización de cuidadores**: el médico vinculado crea, cambia el alcance y revoca el vínculo; el paciente ve la lista de acceso pero no puede revocarlo; el administrador solo lee el directorio. Las tres mutaciones se auditan. Lo decide el ADR 0012.
- **Correcciones de la revisión del backend**: la página pública de estado solo dice si cada componente responde, la siembra no fecha nada en el futuro y rellena los contactos de un perfil antiguo sin pisar lo editado, y el contrato publica las dos respuestas del cambio de contraseña.
- **Documentación**: doce ADR, índice de diagramas UML en `docs/uml/` con código e imagen de los cincuenta y nueve, capturas del prototipo en `docs/capturas/`, contrato de la API actualizado y la matriz de los cuarenta y siete requerimientos generada.
- **Correcciones de la revisión de la interfaz**: el chatbot declara que no está disponible y sus ejemplos son texto, no controles; el consentimiento se lee completo antes de aceptarlo y lo sirve la API desde un documento versionado; el paciente sin consentimiento conserva su historia y solo pierde la escritura y el resumen; la sesión no se cierra por un error del servidor y sí se limpia cuando el refresco muere; la edad se calcula por calendario; la consola de auditoría conoce las acciones de cuidadores.
- **Verificación**: 518 pruebas de backend (328 de integración y 190 unitarias), 30 de los scripts y 704 de la interfaz en 56 archivos, todas en verde; compilación de la interfaz con TypeScript estricto; `make docs`, `make contract` y los verificadores de autoría y estilo limpios. La pila levanta con las nueve migraciones y la base queda sembrada con las siete cuentas.

## En curso

- Ninguno. Todo está fusionado y verificado en `main`; falta publicarlo.

## Siguiente paso

- Publicar `main` en el repositorio y abrir el incremento del modelo de apoyo a la decisión: RF-09, RF-11 y RF-13, con la elección del banco de datos como primer entregable.
- Antes de tocar código, leer `docs/manual/requerimientos.md` para los requerimientos que abre el incremento y `.agents/BACKLOG.md` para lo pendiente.

## Bloqueos

- **Firma clínica de los umbrales de `alert_config`.** Fecha de corte: 30 de noviembre de 2026. Mientras no exista, los umbrales sembrados y los que edita la pantalla de administración son una propuesta documentada y ninguna alerta es evidencia clínica.
- **Elección del banco de datos público para el adaptador de modelo.** Fecha de corte: 30 de noviembre de 2026. Sin elección, RF-09 se sostiene con reglas y el adaptador queda parcial.
- **La clave de ingesta es de despliegue, no por dispositivo.** Una clave filtrada puede escribir para cualquier paciente con consentimiento.

## Lo que está declarado pendiente en la interfaz

Conviene que quien lea esto no confunda lo que hay con lo que parece. La tarjeta de recomendación muestra un texto fijo y un jurado debe saberlo: el modelo no existe, RF-09 está pendiente y el socio decidió dejar la tarjeta como está; el repositorio lo declara aquí y en la matriz, pero la frase visible sigue invitando a ajustar la medicación sin que ningún modelo la respalde. El chatbot ya dice que no está disponible. Las notificaciones se calculan y se guardan en el navegador: sin servicio de envío, con la aplicación cerrada no llega nada. La pantalla de dispositivo recuerda tensiómetros con Web Bluetooth pero no registra lecturas. El nivel de riesgo que se muestra es la categoría de guía del promedio de siete días, no la clasificación del modelo. El contraste de la paleta oscura no se midió. Medicación, adherencia y recordatorios no tienen pantalla todavía. El paciente ve quién tiene acceso a su historia y no puede revocarlo: pedirle la revocación al médico no tiene todavía un canal formal en la interfaz. Las capturas de `docs/capturas/` son anteriores a estas correcciones y el índice del manual lo advierte.

## Notas operativas

- El contenedor del backend no recarga código y `compose up --build` no siempre lo recrea: después de cambiar código hay que recrearlo con `compose up -d --force-recreate --no-deps backend`, o la pila sigue sirviendo la versión anterior.
- Las pruebas de integración vacían las tablas mutables entre una prueba y la siguiente. Después de una corrida completa hay que resembrar con `make seed`. `python -m hta.db.seed --reset` borra los datos clínicos de demostración y conserva las cuentas.
- La interfaz se desarrolla con npm, no con pnpm; su imagen compila con `npm ci` y `npm run build` dentro del contenedor, y Node 22 es lo que piden sus dependencias de prueba.
- `docs/api/openapi.json` se genera con `make contract` y una prueba lo compara con el código: si una ruta cambia y no se regenera, la suite lo dice.
- Toda tarea que añada o cambie una ruta actualiza `docs/api/api-para-el-frontend.md` en la misma tarea.
- Los diagramas viven solo en `docs/uml/`; `docs/manual/diagramas-uml.md` es un puntero para los enlaces del manual.
- Las capturas de `docs/capturas/` pesan catorce megabytes; son evidencia para el manual y no se regeneran solas.
- El diccionario de `docs/manual/modelo-de-datos.md` ya sirve como sección 2.2: incluye la tabla que cruza cada migración con su ADR y declara que las extensiones son columnas nuevas, sin tabla ni enumerado adicionales. Falta pegarlo en el Word y ajustar la numeración del documento académico.

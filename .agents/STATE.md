# Estado del proyecto

Fecha de actualización: 2026-11-08

Este archivo se lee al empezar cada sesión y se actualiza al cerrarla. El comando `make brief` imprime este estado, el backlog y el mapa de trazabilidad en una pantalla.

## Terminado

- **Incremento 1 cerrado**: esquema clínico de dieciséis tablas y siete enumerados, pila de contenedores, sesión con rotación de refresco, cuentas y roles, consentimiento versionado, datos de demostración y trazabilidad generada. El paquete de esa revisión es `docs/manual/entrega-01.md`.
- **Incremento 2 del backend terminado**: el contrato HTTP está congelado y publicado en `docs/api/openapi.json` con su esquema de seguridad, CORS para el origen de desarrollo del frontend y el documento `docs/api/api-para-el-frontend.md` escrito para quien lo consume.
- Rutas clínicas: alta de lectura con síntomas, compuerta de consentimiento y validación fisiológica; directorio de pacientes; consulta paginada de lecturas y síntomas con filtros de fecha; resumen de la ventana domiciliaria de siete días.
- Alertas: bandeja con filtros, detalle con el motivo del descarte leído del rastro y las tres transiciones humanas, exclusivas del rol médico.
- Ingesta de dispositivos: `POST /api/ingest/readings` con clave compartida, escritura en los dos almacenes, deduplicación por paciente, dispositivo e instante con cerrojo consultivo, y `iot/simulator.py`.
- La suite completa corre contra el contenedor: 156 pruebas de integración, 56 unitarias y 30 de los scripts, sin violaciones de autoría ni de estilo. La base quedó sembrada con las siete cuentas, ochenta lecturas, la alerta abierta y el síntoma de demostración.
- Sin cambios de esquema: ninguna migración nueva en todo el incremento. La lectura del historial sin consentimiento vigente quedó registrada en `docs/adr/0003-lectura-del-historial-sin-consentimiento-vigente.md`.

## En curso

- Ninguno. La rama `incremento-2-backend` está completa y verificada contra la pila; falta la revisión final de la rama y la fusión a `main`.

## Siguiente paso

- Revisión final de la rama y fusión a `main`, y publicación en el espejo de GitHub para que el integrante de frontend empiece sobre el contrato congelado.
- Después, el frente del frontend: pantallas de sesión, cuentas, consentimiento, registro de lectura, tableros y bandeja de alertas, consumiendo `docs/api/api-para-el-frontend.md`.
- El siguiente incremento del backend lo decide lo que el frontend necesite y los bloqueos de abajo.

## Bloqueos

- **Firma clínica de los umbrales de `alert_config`.** Fecha de corte: 30 de noviembre de 2026. Mientras no exista, RF-10 y RF-14 no se presentan como evidencia clínica.
- **Elección del banco de datos público para el adaptador de modelo.** Fecha de corte: 30 de noviembre de 2026. Sin elección, RF-09 se sostiene con reglas y el adaptador queda parcial.
- **La clave del dispositivo es de despliegue, no por dispositivo.** Una clave filtrada puede escribir para cualquier paciente con consentimiento. Necesita credenciales por dispositivo y una decisión de esquema que hoy no está tomada.

## Notas operativas

- El contenedor del backend no recarga código y `compose up --build` no siempre lo recrea: después de cambiar código hay que recrearlo con `compose up -d --force-recreate --no-deps backend` o reiniciarlo, o la pila sigue sirviendo la versión anterior aunque la imagen se haya reconstruido. Pasó y costó dos pruebas en rojo.
- Las pruebas de integración vacían las tablas mutables entre una prueba y la siguiente, así que una base sembrada queda vacía después de correrlas. Después de cualquier corrida completa hay que resembrar con `make seed`.
- El backend se niega a arrancar si `HTA_JWT_SECRET` conserva el valor de ejemplo o mide menos de 32 bytes.
- `docs/api/openapi.json` se genera con `make contract` y una prueba compara el archivo con lo que produce el código: si una ruta cambia y no se regenera, la suite lo dice.
- Toda tarea que añada o cambie una ruta actualiza `docs/api/api-para-el-frontend.md` en la misma tarea. El documento no puede quedar desfasado entre tareas.
- La demo que un tutor puede recorrer hoy es por API: `http://localhost:8000/docs`, con las siete cuentas de `docs/manual/cuentas-demo.md`. La interfaz web sigue siendo un esqueleto.
- `docs/fuentes/` guarda los cuatro documentos del socio. La sección 2.2 del manual sigue sin las dos columnas críticas ni las tres acciones de borrado explícitas; el diccionario del repositorio ya las tiene.

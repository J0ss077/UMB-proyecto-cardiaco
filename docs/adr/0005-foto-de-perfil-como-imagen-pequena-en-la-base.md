# ADR 0005: foto de perfil como imagen pequeña en la base

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: modelo relacional, tabla `patient_profiles`, rutas `GET` y `PATCH /api/profile`

## Contexto

La pantalla de perfil permite poner, recortar y quitar una foto. La plataforma no tiene
almacenamiento de archivos, y el modelo relacional tiene dieciséis tablas que no se amplían. La
foto de una persona es un dato personal sensible y debe poder olvidarse cuando se desactiva la
cuenta.

## Decisión

Se añade una columna nullable `avatar TEXT` a `patient_profiles`, en la migración
`0003_patient_avatar.sql`. Guarda la imagen como URL de datos (`data:image/jpeg;base64,...`).
El cliente la recorta, la gira y la reduce a un cuadrado de 256 píxeles antes de enviarla, así
que pesa decenas de kilobytes.

`PATCH /api/profile` acepta el campo `avatar`:

- Un valor `null` o vacío quita la foto y el perfil vuelve a mostrar las iniciales.
- Un valor con contenido debe ser una URL de datos de tipo `image/jpeg`, `image/png` o
  `image/webp`, con base64 válido, con una cabecera de archivo que coincida con el tipo
  declarado, y de hasta 150 000 caracteres. Cualquier otro valor responde 422 y no cambia nada.
- La auditoría `profile.updated` nombra el campo `avatar` y nunca guarda su contenido.

La desactivación de la cuenta vacía la columna junto con los demás datos de contacto.

## Por qué

- Cabe en las dieciséis tablas y no introduce una dependencia de almacenamiento de objetos para
  un solo archivo pequeño por paciente.
- Validar el tipo, la cabecera y el tamaño en el servidor impide que el campo sirva para guardar
  otra cosa, como una página o un script, aunque el cliente envíe lo que quiera. No se admite
  SVG, que puede llevar código.
- Reducir la imagen en el cliente acota el peso y evita guardar la foto original, que puede
  llevar metadatos como la ubicación.

## Alternativas consideradas

### Guardar archivos en disco o en un almacenamiento de objetos

Escala mejor para imágenes grandes, pero obliga a añadir un servicio, permisos de acceso por
paciente y limpieza al desactivar. Para un avatar de 256 píxeles no compensa.

### Guardar la foto solo en el navegador

Evita la migración, pero la foto no sobrevive a un cambio de equipo ni la ve el médico, y un
dato sensible quedaría en un almacenamiento local sin auditoría.

## Consecuencias

- Cada lectura del perfil devuelve la foto. Con 256 píxeles el costo es bajo; si más adelante se
  admiten imágenes grandes, esta decisión se revisa y la foto pasa a su propia ruta.
- La foto no se comparte con el médico ni con el cuidador: ninguna ruta suya devuelve el perfil
  del paciente.

# ADR 0002: umbrales críticos en `alert_config`

- Estado: aceptado
- Fecha: 2026-10-19
- Ámbito: modelo relacional, tabla `alert_config`

## Contexto

El tipo enumerado `alert_severity` tiene cuatro niveles: `low`, `medium`, `high` y `critical`.
La tabla `alert_config` del manual técnico solo declara dos umbrales, `low_threshold` y
`high_threshold`, y una métrica. Con esas dos columnas se pueden configurar los niveles
inferior y superior de una métrica, pero no existe ningún lugar donde declarar el umbral del
nivel `critical`. Una alerta de severidad `critical` quedaría sin una regla configurable que
la origine, o la aplicación tendría que deducirla de valores fijos que escapan a la
configuración por paciente.

El modelo relacional tiene dieciséis tablas y ese número forma parte del contrato con el
manual técnico. Cualquier extensión debe caber dentro de las dieciséis o justificar por qué
el contrato cambia.

## Decisión

Se añaden dos columnas nullable a `alert_config`:

- `critical_low NUMERIC`: umbral inferior del nivel `critical`.
- `critical_high NUMERIC`: umbral superior del nivel `critical`.

`low_threshold` y `high_threshold` conservan su significado actual para los niveles `low`,
`medium` y `high`. El nivel `critical` se configura con las dos columnas nuevas. Ambas son
nullable porque una configuración puede no declarar banda crítica; en ese caso el nivel
`critical` no se dispara por umbral y la configuración conserva el significado que tenía
antes de la extensión. La base de datos no impone el orden entre los cuatro umbrales: la
validación de coherencia y de rangos fisiológicos vive en la aplicación, de modo que un
valor atípico se conserva en lugar de rechazarse.

## Alternativas consideradas

### Una tabla nueva de reglas de alerta

Permitiría una fila por nivel de severidad, con su umbral y su vigencia, y sería más
expresiva ante nuevos niveles. Se descarta porque el número de tablas es parte del contrato
con el manual: una decimoséptima tabla obliga a rehacer el diccionario, el diagrama y el
conteo que el tutor verifica. Además, abre la puerta a resolver con una tabla nueva cada
necesidad de configuración, y el esquema deja de ser estable frente a cambios menores.

### Una columna de severidad y una fila por nivel

Añadir `severity alert_severity` a `alert_config` y sembrar una fila por nivel también
resolvería el problema sin una tabla nueva. Se descarta porque cambia la forma de la tabla
existente y obliga a migrar y reinterpretar todas las filas actuales; las dos columnas
nullable son aditivas, no requieren reescribir datos y dejan intacto el resto del contrato.

### Dos umbrales fijos en la aplicación

Mantener los umbrales críticos como constantes del código evitaría tocar el esquema. Se
descarta porque los umbrales clínicos deben vivir en `alert_config`, sembrarse con su fuente
documentada y poder revisarse sin desplegar código nuevo.

## Consecuencias

- El diccionario de datos del manual se actualiza con las dos columnas nuevas en la misma
  entrega; este ADR es su justificación y `docs/manual/modelo-de-datos.md` la transcripción
  vigente.
- La migración inicial crea las dos columnas como `NUMERIC` nullable. No hay `CHECK`: la
  coherencia entre umbrales y la validación fisiológica son responsabilidad de la aplicación.
- La siembra de umbrales debe indicar la fuente de cada valor. Mientras un clínico no los
  firme, no cuentan como evidencia clínica.
- Agregar un quinto nivel de severidad exigiría revisar esta decisión: el par de columnas
  críticas no se generaliza a un número arbitrario de bandas.
- El conteo de dieciséis tablas no cambia.

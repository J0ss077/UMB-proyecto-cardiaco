# ADR 0001: Python 3.12 con FastAPI para el backend

- Estado: aceptado
- Fecha: 2026-10-19
- Ámbito: lenguaje y framework del backend, y su relación con la pila de datos

## Contexto

La documentación de semestre 1, sección 6.1, describe la arquitectura del prototipo con esta frase:

> La arquitectura será modular, escalable y monolítica, desarrollada con tecnologías como Python, TensorFlow, Node.js, MongoDB, React.js y Docker, asegurando interoperabilidad, seguridad y facilidad de despliegue en entornos tanto académicos como clínicos.

La fórmula "tecnologías como" introduce una enumeración ilustrativa, no un conjunto obligatorio. La lista mezcla categorías que no son intercambiables: un lenguaje de propósito general (Python), una biblioteca de aprendizaje automático (TensorFlow), un entorno de ejecución del lado del servidor (Node.js), un motor de base de datos (MongoDB), una biblioteca de interfaz (React.js) y una herramienta de contenedores (Docker). No es un stack que se pueda adoptar como contrato cerrado, sino una muestra de las piezas que el documento espera encontrar. Leerla como una prescripción obligaría a adoptar las seis piezas en bloque, incluidas TensorFlow y Node.js, sin que el manual técnico lo exija.

El manual técnico v01 no fija un lenguaje de aplicación. Define los módulos, los actores, los casos de uso, los requisitos y el modelo de datos relacional con dieciséis tablas, siete tipos enumerados y sus relaciones. Ninguna de esas piezas nombra un lenguaje ni un framework de servidor. El manual prevalece como especificación funcional: lo que no fija no puede exigirse. Por tanto, la elección de implementación queda en el equipo, y se registra aquí en lugar de quedar implícita en el código.

El backend concentra las reglas clínicas, la validación fisiológica, la autenticación con roles, el consentimiento informado, el cálculo de alertas, los reportes y la auditoría. Es la pieza donde un error de tipos se convierte en un dato clínico mal interpretado; necesita validación declarativa, un contrato HTTP verificable y una configuración explícita.

## Decisión

El backend se implementa como un monolito modular en Python 3.12 con FastAPI, servido por Uvicorn.

- **Python 3.12** es la versión fijada en la imagen del backend. El host puede tener otra versión; la imagen y la integración continua usan 3.12.
- **FastAPI** define los endpoints y genera el contrato OpenAPI que consume la interfaz. Es la única costura entre el frontend y el backend.
- **Pydantic** valida los cuerpos de entrada y salida, y **pydantic-settings** lee la configuración de variables de entorno con prefijo `HTA_`, sin valores por omisión para los secretos.
- **psycopg 3** accede a PostgreSQL, que es la fuente de verdad del registro clínico porque el modelo del manual es relacional: llaves foráneas, tipos enumerados y restricciones de integridad.
- **pymongo** accede a MongoDB, que conserva el flujo crudo de dispositivos en las dos colecciones que el manual exige. MongoDB se mantiene de la enumeración original con ese propósito, no como sustituto del registro clínico.
- **PyJWT** emite y valida los tokens de acceso. **pytest** ejecuta las pruebas unitarias y de integración.
- **Docker** empaqueta el servicio y **React** queda del lado de la interfaz. **TensorFlow** no forma parte de esta decisión: el clasificador del componente de aprendizaje automático se entrena con scikit-learn, y el backend no depende de esa biblioteca.

La aplicación se construye con una fábrica, `create_app()`, que no abre conexiones al construirse. Cada comprobación de dependencia ocurre dentro de la petición que la necesita, de modo que el servicio puede arrancar aunque una base de datos todavía no esté disponible y el estado degradado se informa en `/api/health` en lugar de impedir el arranque.

## Alternativas consideradas

### Node.js con Express o NestJS

Es la opción que la documentación de semestre 1 nombra de forma explícita y permitiría un solo lenguaje entre la interfaz y el servidor. Se descarta porque la enumeración es ilustrativa, porque la lógica clínica y el componente de aprendizaje automático se implementan en Python y mantener dos lenguajes para el dominio duplica el esfuerzo de un equipo de tres personas, y porque la validación declarativa y el contrato OpenAPI de FastAPI resuelven la costura con la interfaz con menos código propio. La interfaz sigue en React; la decisión no la cambia.

### Django

Ofrece ORM, panel de administración y autenticación integrados. Se descarta porque el esquema es propiedad de las migraciones SQL y del modelo de datos del manual: un ORM que genera su propio esquema competiría con esa fuente de verdad, y el panel y las plantillas no se usan en una API JSON consumida por React.

### Flask

Es más pequeño y conocido. Se descarta porque no ofrece validación de datos ni generación de OpenAPI de forma nativa; habría que reconstruir a mano la validación y el contrato que FastAPI entrega, justo en la pieza donde la precisión de los tipos importa más.

## Consecuencias

- El backend y el componente de aprendizaje automático comparten lenguaje y herramientas, lo que reduce el costo de mantener la lógica clínica y el modelo en el mismo equipo.
- El contrato OpenAPI se genera desde el código y es verificable sin la interfaz. Un cambio incompatible se anuncia con una nueva versión del prefijo.
- La configuración es explícita: los secretos no tienen valor por omisión en el código y el arranque falla si faltan variables obligatorias.
- El equipo mantiene Python en el servidor y JavaScript en la interfaz. Esa separación es deliberada y se sostiene con el contrato HTTP.
- FastAPI y su ecosistema son más jóvenes que Django. La mitigación es mantener el backend pequeño y cubierto por pruebas, y no depender de paquetes que no estén en la lista de dependencias declarada.
- La imagen fija Python 3.12 aunque el host tenga otra versión. Las pruebas locales corren en un entorno virtual del host; la versión desplegada es la de la imagen.
- Esta decisión se revisa si el manual técnico o una fuente institucional posterior fijan un lenguaje de aplicación; hoy no lo hacen.

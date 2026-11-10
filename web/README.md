# Interfaz web

Pantallas de la plataforma de telemonitoreo de hipertensión arterial. El paciente registra lecturas y síntomas, acepta el consentimiento y consulta a su médico. El médico revisa pacientes, alertas y consultas. El cuidador ve a quien lo autorizó. El administrador gestiona cuentas, vínculos, umbrales y auditoría.

No diagnostica ni trata. Una alerta solo la cierra una persona, y el formato de chequeo es el texto que el médico escribió para esa consulta.

## Qué hay por rol

| Rol | Recorrido |
| --- | --- |
| Paciente | Inicio, tendencia, registro de lectura y síntoma, perfil, historial descargable y ayuda con la consulta al médico |
| Médico | Inicio, pacientes, alertas y consultas. En la consulta envía el enlace de Meet, si se pidió, y después el comentario con el formato de chequeo |
| Cuidador | Inicio, pacientes autorizados, alertas en solo lectura y una guía gráfica |
| Administrador | Cuentas, vínculos, umbrales y auditoría |

La consulta queda en revisión al enviarla, pendiente cuando el médico manda el enlace de Meet y completada cuando escribe el formato y el comentario.

## Lo que todavía no está

Estas pantallas existen como marcador y lo dicen en la propia interfaz; no simulan la función que falta.

| Pantalla | Estado |
| --- | --- |
| Chatbot (RF-20) | El asistente no está disponible. No envía preguntas ni devuelve respuestas; las preguntas que se ven son ejemplos de lo que responderá cuando exista el modelo. |

## Cómo verla con la pila

Desde la raíz del repositorio, con la pila levantada (`make up` y `make seed`), la interfaz compilada queda en `http://localhost:3000`. El puerto se cambia con `WEB_PORT`.

Las siete cuentas y la contraseña están en [`docs/manual/cuentas-demo.md`](../docs/manual/cuentas-demo.md).

## Cómo desarrollarla

Hace falta Node 22, el mismo de la imagen, y la API en `http://localhost:8000`.

```bash
cd web
npm install
npm run dev
```

Vite abre `http://localhost:5173` y llama a la API en `http://localhost:8000`. Para apuntar a otro backend:

```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

La API acepta por omisión los orígenes `http://localhost:5173` y `http://localhost:3000`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas con Vitest |
| `npm run typecheck` | TypeScript estricto, sin emitir archivos |
| `npm run build` | Comprueba tipos y deja la aplicación en `dist/` |
| `npm start` | Sirve `dist/` en el puerto 3000. Pide haber compilado antes |

La imagen de `web/Dockerfile` hace el build y `server.js` publica esa carpeta. Cualquier ruta que no sea un archivo devuelve `index.html`.

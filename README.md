# Plataforma de telemonitoreo de hipertensión arterial

Prototipo de grado de Ingeniería de Software (Universidad Manuela Beltrán) para el seguimiento domiciliario de pacientes con hipertensión arterial. El sistema registra lecturas de presión arterial y síntomas, exige consentimiento informado antes de procesar datos clínicos, clasifica la severidad de las alertas y las deja a la espera de validación médica. Incluye un modelo de IA de apoyo a la decisión que estima la probabilidad de descontrol tensional; no diagnostica ni trata.

## Cómo se organiza el repositorio

Cada carpeta aparece cuando empieza la parte del trabajo que le corresponde.

| Ruta       | Contenido                                                                         |
| ---------- | --------------------------------------------------------------------------------- |
| `backend/` | API y lógica clínica: autenticación, roles, consentimiento, lecturas y alertas    |
| `web/`     | Interfaz web para paciente, médico, cuidador y administrador                      |
| `db/`      | Migraciones del registro clínico y colecciones del flujo crudo de dispositivos    |
| `ml/`      | Entrenamiento, evaluación y modelo serializado del clasificador                   |
| `iot/`     | Contrato de ingesta y simulador de dispositivo                                    |
| `deploy/`  | Imágenes y orquestación de los servicios                                          |
| `scripts/` | Generadores y verificadores ejecutables por personas                              |
| `docs/`    | Manual, decisiones de arquitectura, contrato de la API, diagramas e investigación |

## Requisitos previos

- `git` y `make`.
- `podman-compose` o `docker compose`, con el motor de contenedores en marcha.
- Puertos libres: 8000 para la API, 5432 para PostgreSQL y 27017 para MongoDB.

## Cómo levantarlo

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
# pega el resultado en HTA_JWT_SECRET dentro de .env
make up
```

El backend se niega a arrancar si `HTA_JWT_SECRET` conserva el valor de ejemplo o mide menos de 32 bytes: con una clave conocida, cualquiera puede firmar un token válido. El comando de arriba genera una.

`make up` usa `podman-compose` si está instalado y, si no, cae a `docker compose`. Los comandos equivalentes sin `make` son:

```bash
podman-compose up -d --build
```

```bash
docker compose up -d --build
```

Con la pila levantada, `make seed` siembra los datos de demostración y la salud del sistema se consulta en `http://localhost:8000/api/health`. Para detenerla: `make down`.

## Cómo correr las pruebas

```bash
make test
```

Las pruebas unitarias no tocan base de datos. Las de integración corren contra el PostgreSQL y el MongoDB de la pila, así que requieren `make up` antes. La verificación completa, que suma autoría y estilo a las pruebas, es:

```bash
make check
```

## Cuentas de demostración

La siembra de `make seed` crea siete cuentas, todas con la contraseña `Demo2026!`.

| Correo               | Rol           | Qué demuestra                                                   |
| -------------------- | ------------- | --------------------------------------------------------------- |
| `admin@hta.demo`     | Administrador | Gestión de cuentas, roles y catálogos                           |
| `medico@hta.demo`    | Médico        | Validación y cierre de alertas de sus pacientes                 |
| `cuidador@hta.demo`  | Cuidador      | Acceso solo al paciente que lo autorizó                         |
| `paciente1@hta.demo` | Paciente      | Lecturas fuera de rango conservadas con su estado de validación |
| `paciente2@hta.demo` | Paciente      | Alerta abierta a la espera de validación médica                 |
| `paciente3@hta.demo` | Paciente      | Consentimiento revocado: no se procesan datos clínicos          |
| `paciente4@hta.demo` | Paciente      | Cuidador autorizado sobre su seguimiento                        |

## Dónde seguir leyendo

- `docs/` reúne la documentación del proyecto: requerimientos, modelo de datos, decisiones de arquitectura y diagramas.
- Lo que no está implementado se declara como pendiente en el manual, con su requerimiento. El sistema no anuncia como terminado lo que todavía no hace.

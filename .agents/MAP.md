# Mapa de trazabilidad

Generado por `scripts/build_map.py` desde las anotaciones `@requirement` del código. No se edita a mano: se regenera con `make docs`. El estado y el texto de cada requerimiento están en `docs/manual/requerimientos.md`.

Requerimientos en el catálogo: 47. Con al menos una anotación: 3. Archivos con anotación de requerimiento: 19 (13 módulos y 6 pruebas). Archivos de infraestructura (`@requirement none`): 10. Archivos sin anotación: 25.

## RF-01 Registro, autenticación y recuperación de credenciales

Módulos:

- `backend/src/hta/audit/__init__.py`
- `backend/src/hta/audit/service.py`
- `backend/src/hta/auth/deps.py`
- `backend/src/hta/auth/passwords.py`
- `backend/src/hta/auth/router.py`
- `backend/src/hta/auth/service.py`
- `backend/src/hta/auth/tokens.py`

Pruebas:

- `backend/tests/integration/auth/test_login.py`
- `backend/tests/integration/auth/test_refresh.py`

## RF-02 Roles y permisos

Módulos:

- `backend/src/hta/accounts/__init__.py`
- `backend/src/hta/accounts/router.py`
- `backend/src/hta/accounts/service.py`

Pruebas:

- `backend/tests/integration/accounts/test_deactivate.py`
- `backend/tests/integration/accounts/test_register.py`
- `backend/tests/integration/accounts/test_roles.py`

## RF-03 Consentimiento informado

Módulos:

- `backend/src/hta/consent/__init__.py`
- `backend/src/hta/consent/router.py`
- `backend/src/hta/consent/service.py`

Pruebas:

- `backend/tests/integration/consent/test_consent.py`

## Requerimientos sin anotación

Ninguna anotación del código cubre estos requerimientos: RF-04, RF-05, RF-06, RF-07, RF-08, RF-09, RF-10, RF-11, RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RF-19, RF-20, RF-21, RF-22, RF-23, RF-24, RF-25, RF-26, RF-27, RNF-01, RNF-02, RNF-03, RNF-04, RNF-05, RNF-06, RNF-07, RNF-08, RNF-09, RNF-10, RNF-11, RNF-12, RNF-13, RNF-14, RNF-15, RNF-16, RNF-17, RNF-18, RNF-19, RNF-20.

## Módulos sin anotación

Estos archivos no declaran ningún requerimiento; el hueco queda a la vista para cerrarlo en el siguiente incremento.

- `backend/src/hta/__init__.py`
- `backend/src/hta/api/__init__.py`
- `backend/src/hta/api/health.py`
- `backend/src/hta/app.py`
- `backend/src/hta/auth/__init__.py`
- `backend/src/hta/config.py`
- `backend/src/hta/db/__init__.py`
- `backend/src/hta/db/migrate.py`
- `backend/src/hta/db/mongo.py`
- `backend/src/hta/db/pool.py`
- `backend/tests/__init__.py`
- `backend/tests/integration/__init__.py`
- `backend/tests/integration/conftest.py`
- `backend/tests/integration/test_health.py`
- `backend/tests/integration/test_mongo.py`
- `backend/tests/integration/test_schema.py`
- `backend/tests/unit/__init__.py`
- `backend/tests/unit/auth/__init__.py`
- `backend/tests/unit/auth/test_passwords.py`
- `backend/tests/unit/auth/test_tokens.py`
- `backend/tests/unit/test_config.py`
- `backend/tests/unit/test_health.py`
- `backend/tests/unit/test_migrate.py`
- `backend/tests/unit/test_mongo.py`
- `db/migrations/0001_initial.sql`

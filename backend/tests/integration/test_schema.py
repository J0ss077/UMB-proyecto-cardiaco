"""Pruebas del esquema relacional del registro clínico."""

import psycopg
import pytest

from hta.db.migrate import apply_migrations

pytestmark = pytest.mark.integration

EXPECTED_TABLES = {
    "users",
    "patient_profiles",
    "patient_physician",
    "caregiver_links",
    "consents",
    "readings",
    "symptoms_mood",
    "medications",
    "adherence_events",
    "alerts",
    "alert_config",
    "reports",
    "reminders",
    "teleconsultations",
    "audit_logs",
    "refresh_tokens",
}

# El registro interno del ejecutor no es una tabla clínica, pero existe en toda
# base migrada y la comparación exacta tiene que contarlo.
MIGRATION_REGISTRY = "schema_migrations"

EXPECTED_ENUMS = {
    "alert_severity": ["low", "medium", "high", "critical"],
    "alert_status": ["open", "acknowledged", "validated", "dismissed"],
    "reading_source": ["device", "manual"],
    "reminder_kind": ["medication", "measurement"],
    "teleconsultation_mode": ["sync", "async"],
    "user_role": ["patient", "physician", "caregiver", "admin"],
    "validation_status": ["valid", "out_of_range", "flagged"],
}


def test_all_tables_exist(db):
    rows = db.execute(
        "select table_name from information_schema.tables where table_schema = 'public'"
    ).fetchall()
    assert {row[0] for row in rows} == EXPECTED_TABLES | {MIGRATION_REGISTRY}


def test_enums_have_expected_values(db):
    rows = db.execute(
        "select t.typname, e.enumlabel from pg_type t "
        "join pg_enum e on e.enumtypid = t.oid order by t.typname, e.enumsortorder"
    ).fetchall()
    actual = {}
    for name, label in rows:
        actual.setdefault(name, []).append(label)
    assert actual == EXPECTED_ENUMS


def test_profile_delete_is_restricted(db):
    rows = db.execute(
        "select confdeltype from pg_constraint where conname = 'patient_profiles_user_id_fkey'"
    ).fetchall()
    assert rows[0][0] == "r"


def test_alert_config_has_critical_thresholds(db):
    rows = db.execute(
        "select column_name from information_schema.columns where table_name = 'alert_config'"
    ).fetchall()
    names = {row[0] for row in rows}
    assert {"critical_low", "critical_high"} <= names


def test_migrations_are_idempotent(db):
    applied_once = db.execute("select filename from schema_migrations order by filename").fetchall()
    apply_migrations(db)
    applied_twice = db.execute(
        "select filename from schema_migrations order by filename"
    ).fetchall()
    assert applied_once == applied_twice


def test_failed_migration_leaves_no_partial_tables(db, second_connection, tmp_path):
    """Un archivo que falla no deja ni su tabla ni su registro.

    El archivo roto no falla con ``select 1/0``: PostgreSQL envuelve una cadena
    de sentencias sin parámetros en una transacción implícita propia, así que
    ese error se revertiría aunque el ejecutor no abriera transacción alguna.
    Para probar la transacción del ejecutor, el archivo crea la tabla y se
    registra a sí mismo, y el fallo lo produce el ``insert`` posterior del
    ejecutor, al chocar con la clave primaria que el archivo ya escribió. Sin
    la transacción del ejecutor, la tabla y el registro quedarían confirmados.

    Las comprobaciones se hacen por una segunda conexión, la que observa lo que
    quedó confirmado y no lo que la sesión que migró todavía recuerda.
    """
    broken = tmp_path / "9999_broken.sql"
    broken.write_text(
        "create table should_not_exist (id int);\n"
        "insert into schema_migrations (filename) values ('9999_broken.sql');\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError) as failure:
        apply_migrations(db, extra_directory=tmp_path)

    assert isinstance(failure.value.__cause__, psycopg.errors.UniqueViolation)

    second_connection.execute("set lock_timeout = '5s'")
    assert second_connection.execute(
        "select to_regclass('public.should_not_exist')"
    ).fetchone() == (None,)
    assert second_connection.execute(
        "select count(*) from schema_migrations where filename = '9999_broken.sql'"
    ).fetchone() == (0,)
    # El archivo del proyecto corrió antes y conserva su registro: el fallo es
    # del archivo de prueba, no de la migración real.
    assert second_connection.execute(
        "select count(*) from schema_migrations where filename = '0001_initial.sql'"
    ).fetchone() == (1,)

    # La base quedó utilizable: la segunda conexión escribe y deshace sin rastro.
    with second_connection.transaction():
        second_connection.execute(
            "insert into schema_migrations (filename) values ('recovery_probe')"
        )
        second_connection.execute(
            "delete from schema_migrations where filename = 'recovery_probe'"
        )

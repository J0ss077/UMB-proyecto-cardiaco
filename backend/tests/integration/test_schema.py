"""Pruebas del esquema relacional del registro clínico."""

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


def test_all_tables_exist(db):
    rows = db.execute(
        "select table_name from information_schema.tables where table_schema = 'public'"
    ).fetchall()
    assert EXPECTED_TABLES <= {row[0] for row in rows}


def test_enums_have_expected_values(db):
    rows = db.execute(
        "select t.typname, e.enumlabel from pg_type t "
        "join pg_enum e on e.enumtypid = t.oid order by t.typname, e.enumsortorder"
    ).fetchall()
    actual = {}
    for name, label in rows:
        actual.setdefault(name, []).append(label)
    assert actual["alert_severity"] == ["low", "medium", "high", "critical"]
    assert actual["user_role"] == ["patient", "physician", "caregiver", "admin"]


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


def test_failed_migration_leaves_no_partial_tables(db, tmp_path):
    bad = tmp_path / "9999_broken.sql"
    bad.write_text("create table should_not_exist (id int); select 1/0;", encoding="utf-8")
    with pytest.raises(Exception):
        apply_migrations(db, extra_directory=tmp_path)
    assert (
        db.execute(
            "select 1 from information_schema.tables where table_name = 'should_not_exist'"
        ).fetchone()
        is None
    )

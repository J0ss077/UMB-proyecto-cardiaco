"""Pruebas unitarias del ejecutor de migraciones: no requieren base de datos."""

from pathlib import Path

import pytest

from hta.db.migrate import _migrations_directory


def test_migrations_directory_is_found_from_the_repository():
    directory = _migrations_directory()
    assert directory == Path(__file__).resolve().parents[3] / "db" / "migrations"
    assert (directory / "0001_initial.sql").is_file()


def test_migrations_directory_is_found_in_the_container_layout(tmp_path):
    origin = tmp_path / "app" / "src" / "hta" / "db" / "migrate.py"
    origin.parent.mkdir(parents=True)
    origin.write_text("", encoding="utf-8")
    expected = tmp_path / "app" / "db" / "migrations"
    expected.mkdir(parents=True)

    assert _migrations_directory(origin) == expected


def test_missing_migrations_directory_fails_loudly(tmp_path):
    origin = tmp_path / "src" / "hta" / "db" / "migrate.py"
    origin.parent.mkdir(parents=True)
    origin.write_text("", encoding="utf-8")

    with pytest.raises(RuntimeError, match="db/migrations"):
        _migrations_directory(origin)

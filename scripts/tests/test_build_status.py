"""@requirement none

Pruebas del generador de la matriz de estado.
"""

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "build_status.py"
CATALOGUE_PATH = Path(__file__).resolve().parents[2] / "docs" / "manual" / "requerimientos.md"

CATALOGUE = """# Catálogo de prueba

## RF-01 Acceso

**Estado:** Implementado

**Texto:** Permitir el acceso de los usuarios.

## RNF-01 Latencia

**Estado:** Pendiente

**Texto:** Responder en menos de dos segundos.
"""


def _load_module():
    spec = importlib.util.spec_from_file_location("build_status", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


build_status_module = _load_module()
build_status = build_status_module.build_status


def _catalogue(root: Path, text: str = CATALOGUE) -> Path:
    path = root / "docs" / "manual" / "requerimientos.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def _write_module(root: Path, relative: str, content: str) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def test_matrix_has_one_row_per_requirement_and_joins_the_evidence(tmp_path):
    catalogue = _catalogue(tmp_path)
    _write_module(tmp_path, "backend/src/auth.py", "# @requirement RF-01\n")
    assert build_status_module.build_map.build_map(tmp_path, catalogue=catalogue) == 0
    assert build_status(tmp_path, catalogue=catalogue) == 0
    text = (tmp_path / "docs" / "estado-requerimientos.md").read_text(encoding="utf-8")
    rows = [
        line
        for line in text.splitlines()
        if line.startswith("| RF-") or line.startswith("| RNF-")
    ]
    assert len(rows) == 2
    functional = next(row for row in rows if row.startswith("| RF-01"))
    assert "Implementado" in functional
    assert "backend/src/auth.py" in functional
    non_functional = next(row for row in rows if row.startswith("| RNF-01"))
    assert "Pendiente" in non_functional
    assert "Sin evidencia anotada" in non_functional
    assert "| — |" in non_functional
    assert "No se edita a mano" in text
    assert "18 de diciembre" in text
    # La matriz y el mapa leen la misma anotación.
    mapa = (tmp_path / ".agents" / "MAP.md").read_text(encoding="utf-8")
    assert "backend/src/auth.py" in mapa


def test_catalogue_without_status_fails(tmp_path):
    catalogue = _catalogue(tmp_path, "## RF-01 Acceso\n\n**Texto:** Algo.\n")
    assert build_status(tmp_path, catalogue=catalogue) == 1


def test_status_outside_the_allowed_words_fails(tmp_path):
    catalogue = _catalogue(
        tmp_path, "## RF-01 Acceso\n\n**Estado:** Hecho\n\n**Texto:** Algo.\n"
    )
    assert build_status(tmp_path, catalogue=catalogue) == 1


def test_partial_without_reason_fails(tmp_path):
    catalogue = _catalogue(
        tmp_path, "## RF-01 Acceso\n\n**Estado:** Parcial\n\n**Texto:** Algo.\n"
    )
    assert build_status(tmp_path, catalogue=catalogue) == 1


def test_implemented_without_annotated_evidence_fails(tmp_path):
    catalogue = _catalogue(
        tmp_path, "## RF-01 Acceso\n\n**Estado:** Implementado\n\n**Texto:** Algo.\n"
    )
    assert build_status(tmp_path, catalogue=catalogue) == 1


def test_missing_catalogue_returns_2(tmp_path):
    catalogue = tmp_path / "docs" / "manual" / "requerimientos.md"
    assert build_status(tmp_path, catalogue=catalogue) == 2


def test_repository_catalogue_covers_every_requirement():
    requirements = build_status_module.parse_catalogue(CATALOGUE_PATH)
    identifiers = [requirement.identifier for requirement in requirements]
    expected = [f"RF-{number:02d}" for number in range(1, 28)]
    expected += [f"RNF-{number:02d}" for number in range(1, 21)]
    assert identifiers == expected

"""Pruebas del verificador de autoría."""

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_authorship.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_authorship", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check_authorship = _load_module()


def run_check(root: Path) -> int:
    return check_authorship.main(["--root", str(root)])


def test_flags_ai_authorship_claim(tmp_path):
    # El ejemplar se arma en dos partes para que este archivo, que también se
    # escanea, no contenga la fórmula que la prueba busca.
    doc = tmp_path / "manual.md"
    doc.write_text("Este documento fue generado por " "IA.", encoding="utf-8")
    assert run_check(tmp_path) == 1


def test_allows_the_word_ai_when_it_names_the_product(tmp_path):
    doc = tmp_path / "manual.md"
    doc.write_text(
        "El sistema integra un modelo de IA de apoyo a la decision.",
        encoding="utf-8",
    )
    assert run_check(tmp_path) == 0


def test_ignores_agent_layer(tmp_path):
    # El ejemplar de la tarea no coincide con ningún patrón, así que se añade un
    # segundo archivo con una fórmula que sí lo haría fuera de la capa de agente.
    agents = tmp_path / ".agents"
    agents.mkdir()
    (agents / "STATE.md").write_text("Sesion asistida por IA.", encoding="utf-8")
    (agents / "NOTES.md").write_text("Este documento fue generado por " "IA.", encoding="utf-8")
    assert run_check(tmp_path) == 0

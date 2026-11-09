"""@requirement none

Pruebas del verificador de autoría.
"""

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


def test_does_not_flag_llm_inside_fullmatch(tmp_path):
    # re.fullmatch es idioma estándar en Python; no declara autoría.
    module = tmp_path / "matcher.py"
    module.write_text("matched = re.fullmatch(pattern, text)\n", encoding="utf-8")
    assert run_check(tmp_path) == 0


def test_still_flags_authorship_formula_with_word_boundary(tmp_path):
    doc = tmp_path / "manual.md"
    doc.write_text("Este documento fue asistido por " "IA.", encoding="utf-8")
    assert run_check(tmp_path) == 1


def test_rejects_a_root_that_is_not_a_directory(tmp_path):
    assert run_check(tmp_path / "no-existe") == 2


def test_exempts_only_the_top_level_agents_guide(tmp_path):
    # La capa de agente admite la mención en el AGENTS.md de la raíz, no en
    # cualquier AGENTS.md del árbol.
    claim = "Este documento fue generado por " "IA."
    (tmp_path / "AGENTS.md").write_text(claim, encoding="utf-8")
    assert run_check(tmp_path) == 0
    nested = tmp_path / "docs"
    nested.mkdir()
    (nested / "AGENTS.md").write_text(claim, encoding="utf-8")
    assert run_check(tmp_path) == 1


def test_ignores_integrity_hashes_in_a_generated_lockfile(tmp_path):
    # Un hash de integridad en base64 puede contener cualquier subcadena.
    lock = tmp_path / "web" / "package-lock.json"
    lock.parent.mkdir()
    lock.write_text('{"integrity": "sha512-/' "LL" "M" 'yas0ljj"}', encoding="utf-8")
    assert run_check(tmp_path) == 0

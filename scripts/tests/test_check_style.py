"""Pruebas del verificador de estilo."""

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_style.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_style", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check_style = _load_module()


def run_style(root: Path) -> int:
    return check_style.main(["--root", str(root)])


def test_flags_emoji_in_markdown(tmp_path):
    (tmp_path / "doc.md").write_text("Listo \U0001F600", encoding="utf-8")
    assert run_style(tmp_path) == 1


def test_allows_plain_text(tmp_path):
    (tmp_path / "doc.md").write_text("Estado: implementado.", encoding="utf-8")
    assert run_style(tmp_path) == 0

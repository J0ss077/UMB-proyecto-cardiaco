"""@requirement none

Pruebas del generador del mapa de trazabilidad.
"""

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "build_map.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("build_map", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


build_map_module = _load_module()
build_map = build_map_module.build_map


def _write_module(root: Path, relative: str, content: str) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def _map(root: Path) -> str:
    return (root / ".agents" / "MAP.md").read_text(encoding="utf-8")


def _section(text: str, heading: str) -> str:
    """Devuelve el cuerpo de una sección del mapa, sin las siguientes."""
    return text.split(f"## {heading}", 1)[1].split("\n## ", 1)[0]


def test_map_lists_requirement_with_files(tmp_path):
    (tmp_path / "backend" / "src").mkdir(parents=True)
    module = tmp_path / "backend" / "src" / "alerts.py"
    module.write_text("# @requirement RF-14\n", encoding="utf-8")
    build_map(tmp_path)
    text = (tmp_path / ".agents" / "MAP.md").read_text(encoding="utf-8")
    assert "RF-14" in text
    assert "backend/src/alerts.py" in _section(text, "RF-14")


def test_unknown_requirement_fails(tmp_path):
    (tmp_path / "backend" / "src").mkdir(parents=True)
    (tmp_path / "backend" / "src" / "x.py").write_text("# @requirement RF-99\n", encoding="utf-8")
    assert build_map(tmp_path) == 1


def test_none_is_valid_and_does_not_appear_as_a_requirement(tmp_path):
    # La siembra es infraestructura: declara que no cubre ningún requerimiento.
    _write_module(tmp_path, "backend/src/seed.py", '"""@requirement none\n\nSiembra."""\n')
    assert build_map(tmp_path) == 0
    text = _map(tmp_path)
    assert "## none" not in text
    assert "backend/src/seed.py" not in text


def test_both_annotation_forms_are_extracted(tmp_path):
    _write_module(
        tmp_path,
        "backend/src/docstring_form.py",
        '"""@requirement RF-01\n\nMódulo de ejemplo."""\n',
    )
    _write_module(tmp_path, "backend/src/comment_form.py", "# @requirement RF-01\n")
    assert build_map(tmp_path) == 0
    section = _section(_map(tmp_path), "RF-01")
    assert "backend/src/docstring_form.py" in section
    assert "backend/src/comment_form.py" in section


def test_annotations_inside_strings_do_not_count(tmp_path):
    # Una cadena de datos no es evidencia: solo vale el comentario o la primera
    # línea del docstring, nunca el texto de una anotación guardado como dato.
    _write_module(
        tmp_path,
        "backend/src/fixture.py",
        'FIXTURE = """\n# @requirement RF-99\n"""\n',
    )
    _write_module(tmp_path, "backend/src/data.py", 'FIXTURE = """\n@requirement RF-99\n"""\n')
    assert build_map(tmp_path) == 0
    text = _map(tmp_path)
    assert "RF-99" not in text
    section = text.split("## Módulos sin anotación", 1)[1]
    assert "backend/src/fixture.py" in section
    assert "backend/src/data.py" in section


def test_template_literal_annotation_does_not_count(tmp_path):
    # Un literal de plantilla de TypeScript es dato, no comentario, aunque la
    # línea empiece por //.
    _write_module(
        tmp_path,
        "web/src/panel.ts",
        "const help = `\n// @requirement RF-14\n`;\n",
    )
    assert build_map(tmp_path) == 0
    text = _map(tmp_path)
    assert "## RF-14" not in text
    assert "web/src/panel.ts" in text.split("## Módulos sin anotación", 1)[1]


def test_dollar_quoted_annotation_does_not_count(tmp_path):
    # Un cuerpo $$ de PostgreSQL es dato, no comentario, aunque la línea empiece
    # por --.
    _write_module(
        tmp_path,
        "db/migrations/0003.sql",
        "CREATE FUNCTION f() RETURNS void AS $$\n-- @requirement RF-14\n$$ LANGUAGE sql;\n",
    )
    assert build_map(tmp_path) == 0
    text = _map(tmp_path)
    assert "## RF-14" not in text
    assert "db/migrations/0003.sql" in text.split("## Módulos sin anotación", 1)[1]


def test_comment_form_is_extracted_in_other_languages(tmp_path):
    _write_module(tmp_path, "db/migrations/0002.sql", "-- @requirement RF-01\n")
    _write_module(tmp_path, "web/src/api.ts", "// @requirement RF-01\n")
    assert build_map(tmp_path) == 0
    section = _section(_map(tmp_path), "RF-01")
    assert "db/migrations/0002.sql" in section
    assert "web/src/api.ts" in section


def test_unannotated_module_lands_in_its_own_section(tmp_path):
    _write_module(tmp_path, "backend/src/config.py", "SETTING = 1\n")
    assert build_map(tmp_path) == 0
    text = _map(tmp_path)
    section = text.split("## Módulos sin anotación", 1)[1]
    assert "backend/src/config.py" in section


def test_section_is_absent_when_no_module_is_missing(tmp_path):
    _write_module(tmp_path, "backend/src/only.py", "# @requirement RF-01\n")
    assert build_map(tmp_path) == 0
    assert "Módulos sin anotación" not in _map(tmp_path)


def test_excluded_directories_are_not_scanned(tmp_path):
    # El proyecto anterior no se lee ni se indexa: una anotación suya no cuenta.
    _write_module(tmp_path, ".legacy-project/old.py", "# @requirement RF-99\n")
    _write_module(tmp_path, "backend/src/only.py", "# @requirement RF-01\n")
    assert build_map(tmp_path) == 0


def test_no_map_is_written_when_a_requirement_is_unknown(tmp_path):
    _write_module(tmp_path, "backend/src/x.py", "# @requirement RF-99\n")
    assert build_map(tmp_path) == 1
    assert not (tmp_path / ".agents" / "MAP.md").exists()


def test_rejects_a_root_that_is_not_a_directory(tmp_path):
    assert build_map(tmp_path / "no-existe") == 2

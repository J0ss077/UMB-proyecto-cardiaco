"""@requirement none

Generador del mapa de trazabilidad de la capa de agente.

Recorre los módulos y las pruebas del repositorio, extrae las anotaciones
`@requirement` de su encabezado y escribe `.agents/MAP.md`: para cada
requerimiento del catálogo, los archivos y las pruebas que lo declaran. Con
`--status-out` genera además la matriz de estado de la capa humana delegando en
`build_status.py`.

La anotación vale en un comentario o en la primera línea del docstring del
módulo. Las regiones de datos no son comentario: los literales de plantilla de
TypeScript, los cuerpos entre dólares y las cadenas de SQL se recorren con un
pequeño autómata, así que una anotación dentro de ellos no cuenta y no puede
fabricar evidencia.

El catálogo canónico es `docs/manual/requerimientos.md`. Una anotación que
nombre un identificador ausente del catálogo detiene la generación con código 1.
`@requirement none` es válido y significa que el archivo es infraestructura y no
cubre ningún requerimiento. Un archivo sin anotación no detiene nada: aparece en
la sección final del mapa, `Módulos sin anotación`, para que el hueco se vea.
"""

from __future__ import annotations

import argparse
import ast
import io
import os
import re
import sys
import tokenize
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

SOURCE_EXTENSIONS = frozenset({".py", ".ts", ".tsx", ".sql"})

EXCLUDED_DIRS = frozenset(
    {".legacy-project", ".recon", ".agents", ".superpowers", "node_modules", ".venv"}
)

EXCLUDED_SUBPATHS = (("docs", "superpowers"), ("ml", "data"))

CATALOGUE_RELATIVE = Path("docs") / "manual" / "requerimientos.md"

DEFAULT_MAP = Path(".agents") / "MAP.md"

NONE = "none"

# La anotación se declara en un comentario o en la primera línea del docstring
# del módulo. El extractor de Python usa el árbol sintáctico y los tokens; el de
# TypeScript y el de SQL distinguen las regiones de datos con un autómata. Así
# una cadena de datos que contenga el texto de la anotación no puede fabricar
# evidencia. Para los demás casos se exige el prefijo de comentario.
AT_ANNOTATION = re.compile(r"^\s*@requirement\s+(?P<identifier>\S+)")
COMMENT_ANNOTATION = re.compile(r"^\s*(?://|#+|--)\s*@requirement\s+(?P<identifier>\S+)")
DOLLAR_TAG = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")

HEADING = re.compile(r"^##\s+(?P<identifier>(?:RF|RNF)-\d{2})(?:\s+(?P<title>.*?))?\s*$")


class CatalogueError(Exception):
    """El catálogo no se puede leer como la fuente canónica de requerimientos."""


@dataclass(frozen=True)
class CatalogueSection:
    """Una sección del catálogo: identificador, título corto y cuerpo."""

    identifier: str
    title: str
    body: str


@dataclass(frozen=True)
class UnknownAnnotation:
    """Una anotación que nombra un requerimiento ausente del catálogo."""

    path: str
    line: int
    identifier: str


class UnknownRequirementError(Exception):
    """Una o más anotaciones nombran un requerimiento que el catálogo no declara."""

    def __init__(self, annotations: Sequence[UnknownAnnotation]) -> None:
        super().__init__("anotaciones con un requerimiento desconocido")
        self.annotations = tuple(annotations)


@dataclass(frozen=True)
class Traceability:
    """Archivos que declaran cada requerimiento, los de infraestructura y los huecos."""

    files_by_requirement: dict[str, tuple[str, ...]]
    unannotated: tuple[str, ...]
    infrastructure: tuple[str, ...]

    @property
    def annotated_files(self) -> tuple[str, ...]:
        """Archivos que declaran al menos un requerimiento, sin repetir."""
        return tuple(
            sorted({path for paths in self.files_by_requirement.values() for path in paths})
        )


def default_catalogue() -> Path:
    """Devuelve el catálogo canónico del repositorio, junto a `scripts/`."""
    return Path(__file__).resolve().parents[1] / CATALOGUE_RELATIVE


def _is_excluded(relative: Path) -> bool:
    """Indica si una ruta relativa a la raíz queda fuera del recorrido."""
    parts = relative.parts
    if any(part in EXCLUDED_DIRS for part in parts):
        return True
    return any(
        tuple(parts[index : index + len(excluded)]) == excluded
        for excluded in EXCLUDED_SUBPATHS
        for index in range(len(parts))
    )


def _iter_sources(root: Path) -> Iterator[Path]:
    """Recorre los archivos anotables, podando las carpetas excluidas."""
    for directory, subdirectories, filenames in os.walk(root):
        current = Path(directory)
        subdirectories[:] = sorted(
            name
            for name in subdirectories
            if not _is_excluded((current / name).relative_to(root))
        )
        for name in sorted(filenames):
            path = current / name
            if path.suffix.lower() in SOURCE_EXTENSIONS:
                yield path


def read_catalogue(path: Path) -> list[CatalogueSection]:
    """Lee el catálogo canónico y devuelve sus secciones en el orden del archivo.

    Cada sección empieza con un encabezado de segundo nivel cuyo primer token es
    el identificador. Un encabezado que no lo sea, o un identificador repetido,
    se rechaza: el catálogo es la autoridad y no admite secciones ambiguas.
    """
    sections: list[CatalogueSection] = []
    seen: set[str] = set()
    current: tuple[str, str] | None = None
    body: list[str] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.startswith("## "):
            match = HEADING.match(line)
            if match is None:
                raise CatalogueError(
                    f"{path}:{number}: la sección no empieza por un identificador: {line.strip()}"
                )
            if current is not None:
                sections.append(CatalogueSection(current[0], current[1], "\n".join(body)))
            identifier = match.group("identifier")
            if identifier in seen:
                raise CatalogueError(f"{path}:{number}: identificador repetido: {identifier}")
            seen.add(identifier)
            current = (identifier, (match.group("title") or "").strip())
            body = []
        elif current is not None:
            body.append(line)
    if current is not None:
        sections.append(CatalogueSection(current[0], current[1], "\n".join(body)))
    if not sections:
        raise CatalogueError(f"{path}: el catálogo no declara ningún requerimiento")
    return sections


def _identifier(match: re.Match[str]) -> str:
    """Devuelve el identificador de una anotación, sin la puntuación final."""
    return match.group("identifier").strip().rstrip(".,;:")


def _docstring_annotation(tree: ast.Module) -> Iterator[tuple[int, str]]:
    """Devuelve la anotación de la primera línea del docstring del módulo."""
    if not tree.body:
        return
    statement = tree.body[0]
    if not (
        isinstance(statement, ast.Expr)
        and isinstance(statement.value, ast.Constant)
        and isinstance(statement.value.value, str)
    ):
        return
    lines = statement.value.value.lstrip().splitlines()
    if not lines:
        return
    match = AT_ANNOTATION.match(lines[0].strip())
    if match is not None and _identifier(match):
        yield statement.lineno, _identifier(match)


def _python_annotations(source: str) -> Iterator[tuple[int, str]]:
    """Extrae las anotaciones del docstring del módulo y de sus comentarios.

    Se usan el árbol sintáctico y los tokens: una cadena de datos que contenga el
    texto de la anotación no es una declaración y no puede fabricar evidencia.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        tree = None
    if tree is not None:
        yield from _docstring_annotation(tree)
    try:
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        for token in tokens:
            if token.type != tokenize.COMMENT:
                continue
            match = COMMENT_ANNOTATION.match(token.string)
            if match is not None and _identifier(match):
                yield token.start[0], _identifier(match)
    except (tokenize.TokenError, IndentationError):
        return


def _skip_quoted(line: str, index: int, quote: str) -> int:
    """Devuelve el índice posterior a la cadena simple o doble que empieza en `index`."""
    index += 1
    while index < len(line):
        if line[index] == "\\":
            index += 2
            continue
        if line[index] == quote:
            return index + 1
        index += 1
    return len(line)


def _scan_typescript_line(line: str, in_template: bool) -> bool:
    """Devuelve si un literal de plantilla sigue abierto al terminar la línea."""
    index = 0
    while index < len(line):
        character = line[index]
        if in_template:
            if character == "\\":
                index += 2
                continue
            if character == "`":
                in_template = False
            index += 1
            continue
        if line.startswith("//", index):
            return in_template
        if character in ("'", '"'):
            index = _skip_quoted(line, index, character)
            continue
        if character == "`":
            in_template = True
        index += 1
    return in_template


def _typescript_annotations(source: str) -> Iterator[tuple[int, str]]:
    """Extrae los comentarios de TypeScript, fuera de sus literales de plantilla."""
    in_template = False
    for number, line in enumerate(source.splitlines(), start=1):
        if not in_template:
            match = COMMENT_ANNOTATION.match(line)
            if match is not None and _identifier(match):
                yield number, _identifier(match)
        in_template = _scan_typescript_line(line, in_template)


def _scan_sql_line(
    line: str, dollar: str | None, in_string: bool
) -> tuple[str | None, bool]:
    """Devuelve el estado de una línea SQL: etiqueta de dólar abierta y cadena."""
    index = 0
    while index < len(line):
        if dollar is not None:
            if line.startswith(dollar, index):
                index += len(dollar)
                dollar = None
                continue
            index += 1
            continue
        if in_string:
            if line[index] == "'":
                if line.startswith("''", index):
                    index += 2
                    continue
                in_string = False
            index += 1
            continue
        if line.startswith("--", index):
            return dollar, in_string
        if line[index] == "'":
            in_string = True
            index += 1
            continue
        if line[index] == "$":
            match = DOLLAR_TAG.match(line, index)
            if match is not None:
                dollar = match.group(0)
                index = match.end()
                continue
        index += 1
    return dollar, in_string


def _sql_annotations(source: str) -> Iterator[tuple[int, str]]:
    """Extrae los comentarios de SQL, fuera de los cuerpos entre dólares y cadenas."""
    dollar: str | None = None
    in_string = False
    for number, line in enumerate(source.splitlines(), start=1):
        if dollar is None and not in_string:
            match = COMMENT_ANNOTATION.match(line)
            if match is not None and _identifier(match):
                yield number, _identifier(match)
        dollar, in_string = _scan_sql_line(line, dollar, in_string)


def _annotations(path: Path) -> Iterator[tuple[int, str]]:
    """Devuelve las anotaciones declaradas en el encabezado de un archivo."""
    source = path.read_text(encoding="utf-8", errors="replace")
    suffix = path.suffix.lower()
    if suffix == ".py":
        yield from _python_annotations(source)
    elif suffix in {".ts", ".tsx"}:
        yield from _typescript_annotations(source)
    elif suffix == ".sql":
        yield from _sql_annotations(source)


def collect(root: Path, identifiers: Iterable[str]) -> Traceability:
    """Agrupa los archivos anotados por requerimiento y devuelve los huecos.

    Lanza `UnknownRequirementError` si alguna anotación nombra un identificador
    que no está entre los del catálogo. `@requirement none` no se agrupa, no
    cuenta como archivo sin anotación y se informa aparte como infraestructura.
    """
    root = root.resolve()
    known = list(identifiers)
    files: dict[str, set[str]] = {identifier: set() for identifier in known}
    unannotated: list[str] = []
    infrastructure: list[str] = []
    unknown: list[UnknownAnnotation] = []
    for path in _iter_sources(root):
        relative = path.relative_to(root).as_posix()
        annotations = list(_annotations(path))
        if not annotations:
            unannotated.append(relative)
            continue
        declares_requirement = False
        declares_none = False
        for number, identifier in annotations:
            if identifier.lower() == NONE:
                declares_none = True
                continue
            if identifier not in files:
                unknown.append(UnknownAnnotation(relative, number, identifier))
                continue
            files[identifier].add(relative)
            declares_requirement = True
        if declares_none and not declares_requirement:
            infrastructure.append(relative)
    if unknown:
        raise UnknownRequirementError(unknown)
    return Traceability(
        files_by_requirement={
            identifier: tuple(sorted(paths)) for identifier, paths in files.items()
        },
        unannotated=tuple(sorted(unannotated)),
        infrastructure=tuple(sorted(infrastructure)),
    )


def _is_test(relative: str) -> bool:
    """Indica si la ruta corresponde a una prueba y no a un módulo."""
    path = Path(relative)
    return (
        "tests" in path.parts[:-1]
        or path.name.startswith("test_")
        or path.name == "conftest.py"
    )


def _bullets(paths: Iterable[str]) -> list[str]:
    """Convierte rutas relativas en una lista de viñetas de Markdown."""
    items = [f"- `{path}`" for path in paths]
    return items if items else ["Ninguno."]


def render_map(sections: Sequence[CatalogueSection], trace: Traceability) -> str:
    """Devuelve el texto del mapa de trazabilidad."""
    annotated = [
        section
        for section in sections
        if trace.files_by_requirement.get(section.identifier)
    ]
    files = trace.annotated_files
    modules = [path for path in files if not _is_test(path)]
    tests = [path for path in files if _is_test(path)]
    lines = [
        "# Mapa de trazabilidad",
        "",
        "Generado por `scripts/build_map.py` desde las anotaciones `@requirement` del código. "
        "No se edita a mano: se regenera con `make docs`. El estado y el texto de cada "
        "requerimiento están en `docs/manual/requerimientos.md`.",
        "",
        f"Requerimientos en el catálogo: {len(sections)}. Con al menos una anotación: "
        f"{len(annotated)}. Archivos con anotación de requerimiento: {len(files)} "
        f"({len(modules)} módulos y {len(tests)} pruebas). Archivos de infraestructura "
        f"(`@requirement none`): {len(trace.infrastructure)}. Archivos sin anotación: "
        f"{len(trace.unannotated)}.",
        "",
    ]
    for section in annotated:
        paths = trace.files_by_requirement[section.identifier]
        heading = f"## {section.identifier} {section.title}".rstrip()
        lines.extend([heading, "", "Módulos:", ""])
        lines.extend(_bullets(path for path in paths if not _is_test(path)))
        lines.extend(["", "Pruebas:", ""])
        lines.extend(_bullets(path for path in paths if _is_test(path)))
        lines.append("")
    missing = [
        section.identifier
        for section in sections
        if not trace.files_by_requirement.get(section.identifier)
    ]
    if missing:
        lines.extend(
            [
                "## Requerimientos sin anotación",
                "",
                "Ninguna anotación del código cubre estos requerimientos: "
                + ", ".join(missing)
                + ".",
                "",
            ]
        )
    if trace.unannotated:
        lines.extend(
            [
                "## Módulos sin anotación",
                "",
                "Estos archivos no declaran ningún requerimiento; el hueco queda a la vista "
                "para cerrarlo en el siguiente incremento.",
                "",
            ]
        )
        lines.extend(f"- `{path}`" for path in trace.unannotated)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_map(path: Path, text: str) -> None:
    """Escribe un archivo generado, creando las carpetas que falten."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def report_unknown(error: UnknownRequirementError, catalogue: Path) -> None:
    """Imprime las anotaciones que el catálogo no reconoce."""
    for annotation in error.annotations:
        print(
            f"{annotation.path}:{annotation.line}: el requerimiento "
            f"{annotation.identifier} no existe en el catálogo {catalogue}.",
            file=sys.stderr,
        )
    print(
        f"Anotaciones con un requerimiento desconocido: {len(error.annotations)}.",
        file=sys.stderr,
    )


def _status_module():
    """Importa `build_status`, que comparte el extractor de este módulo."""
    scripts = str(Path(__file__).resolve().parent)
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    import build_status

    return build_status


def build_map(
    root: Path,
    catalogue: Path | None = None,
    out: Path | None = None,
    status_out: Path | None = None,
) -> int:
    """Genera el mapa y, si se pide, la matriz de estado; devuelve el código de salida."""
    root = Path(root).resolve()
    catalogue = Path(catalogue) if catalogue is not None else default_catalogue()
    if not root.is_dir():
        print(f"Error: la raíz indicada no es un directorio: {root}", file=sys.stderr)
        return 2
    if not catalogue.is_file():
        print(f"Error: no existe el catálogo de requerimientos: {catalogue}", file=sys.stderr)
        return 2
    try:
        sections = read_catalogue(catalogue)
        trace = collect(root, (section.identifier for section in sections))
    except CatalogueError as error:
        print(f"Error: catálogo inválido: {error}", file=sys.stderr)
        return 1
    except UnknownRequirementError as error:
        report_unknown(error, catalogue)
        return 1
    destination = Path(out) if out is not None else root / DEFAULT_MAP
    write_map(destination, render_map(sections, trace))
    print(
        f"Mapa de trazabilidad: {destination} "
        f"({len(trace.annotated_files)} archivos con requerimiento, "
        f"{len(trace.infrastructure)} de infraestructura, "
        f"{len(trace.unannotated)} sin anotación)."
    )
    if status_out is not None:
        return _status_module().build_status(root, catalogue, Path(status_out))
    return 0


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada de la línea de comandos."""
    parser = argparse.ArgumentParser(
        description="Genera el mapa de trazabilidad desde las anotaciones del código."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("."),
        help="Raíz del árbol que se recorre (por omisión, el directorio actual).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Archivo del mapa; por omisión, .agents/MAP.md bajo la raíz.",
    )
    parser.add_argument(
        "--status-out",
        type=Path,
        default=None,
        help="Si se indica, genera también la matriz de estado en esa ruta.",
    )
    parser.add_argument(
        "--catalogue",
        type=Path,
        default=None,
        help="Catálogo canónico; por omisión, docs/manual/requerimientos.md del repositorio.",
    )
    args = parser.parse_args(argv)
    return build_map(
        args.root,
        catalogue=args.catalogue,
        out=args.out,
        status_out=args.status_out,
    )


if __name__ == "__main__":
    raise SystemExit(main())

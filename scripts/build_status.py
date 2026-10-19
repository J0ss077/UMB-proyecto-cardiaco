"""@requirement none

Generador de la matriz de estado de los requerimientos.

Cruza el catálogo canónico `docs/manual/requerimientos.md` con las anotaciones
`@requirement` del código y escribe `docs/estado-requerimientos.md`: una fila por
requerimiento con su estado, la evidencia anotada y, cuando hace falta, el
motivo. El catálogo es la única fuente del estado; la matriz es una vista
derivada y no se edita a mano.

El catálogo se rechaza con código 1 cuando una sección no declara `**Estado:**`,
cuando el estado no es uno de los cuatro permitidos, cuando falta el texto,
cuando un estado parcial no explica su motivo o cuando un estado implementado no
tiene ninguna anotación que lo respalde.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import build_map  # noqa: E402  (se importa después de ajustar sys.path)

STATUS_WORDS = ("Implementado", "Parcial", "Declarado", "Pendiente")

DEFAULT_MATRIX = Path("docs") / "estado-requerimientos.md"

LABEL = re.compile(r"^\*\*(?P<label>Estado|Texto|Motivo):\*\*\s*(?P<value>.*)$")


@dataclass(frozen=True)
class Requirement:
    """Un requerimiento del catálogo con su estado y su enunciado."""

    identifier: str
    title: str
    status: str
    text: str
    reason: str | None


def _labels(identifier: str, body: str) -> dict[str, str]:
    """Extrae las líneas etiquetadas de una sección y rechaza las repetidas."""
    values: dict[str, str] = {}
    for line in body.splitlines():
        match = LABEL.match(line)
        if match is None:
            continue
        label = match.group("label")
        if label in values:
            raise build_map.CatalogueError(
                f"{identifier}: la línea **{label}:** aparece más de una vez"
            )
        values[label] = match.group("value").strip()
    return values


def parse_sections(sections: Sequence[build_map.CatalogueSection]) -> list[Requirement]:
    """Valida el cuerpo de las secciones del catálogo y devuelve los requerimientos."""
    requirements: list[Requirement] = []
    for section in sections:
        labels = _labels(section.identifier, section.body)
        status = labels.get("Estado", "")
        if not status:
            raise build_map.CatalogueError(
                f"{section.identifier}: falta la línea **Estado:**"
            )
        if status not in STATUS_WORDS:
            raise build_map.CatalogueError(
                f"{section.identifier}: estado no permitido: {status!r}; "
                f"los valores son {', '.join(STATUS_WORDS)}"
            )
        text = labels.get("Texto", "")
        if not text:
            raise build_map.CatalogueError(
                f"{section.identifier}: falta la línea **Texto:**"
            )
        reason = labels.get("Motivo") or None
        if status == "Parcial" and reason is None:
            raise build_map.CatalogueError(
                f"{section.identifier}: el estado Parcial exige la línea **Motivo:**"
            )
        requirements.append(
            Requirement(
                identifier=section.identifier,
                title=section.title,
                status=status,
                text=text,
                reason=reason,
            )
        )
    return requirements


def parse_catalogue(path: Path) -> list[Requirement]:
    """Lee y valida el catálogo canónico completo."""
    return parse_sections(build_map.read_catalogue(path))


def _check_evidence(
    requirements: Sequence[Requirement], trace: build_map.Traceability
) -> None:
    """Rechaza un estado implementado que ninguna anotación respalda."""
    for requirement in requirements:
        if requirement.status == "Implementado" and not trace.files_by_requirement.get(
            requirement.identifier
        ):
            raise build_map.CatalogueError(
                f"{requirement.identifier}: se declara Implementado y ninguna anotación "
                "del código lo respalda"
            )


def _cell(value: str) -> str:
    """Deja un valor apto para una celda de tabla de Markdown."""
    return value.replace("|", "\\|").replace("\n", " ")


def _evidence(identifier: str, trace: build_map.Traceability) -> str:
    """Devuelve las rutas anotadas de un requerimiento, o la ausencia de ellas."""
    paths = trace.files_by_requirement.get(identifier, ())
    if not paths:
        return "Sin evidencia anotada."
    return ", ".join(f"`{path}`" for path in paths)


def render_status(
    requirements: Sequence[Requirement], trace: build_map.Traceability
) -> str:
    """Devuelve el texto de la matriz de estado."""
    lines = [
        "# Estado de los requerimientos",
        "",
        "Generado por `scripts/build_status.py` a partir de `docs/manual/requerimientos.md` "
        "y de las anotaciones `@requirement` del código. No se edita a mano: se regenera "
        "con `make docs`.",
        "",
        "Una fila por requerimiento del catálogo. El estado se escribe una sola vez, en el "
        "catálogo, que también guarda el enunciado completo y la fecha del estado vigente. "
        "La columna de evidencia lista los módulos y las pruebas que declaran el "
        "requerimiento; un requerimiento sin evidencia anotada no se declara implementado.",
        "",
        "Esta matriz describe el estado en el momento en que se genera, con la evidencia "
        "anotada hoy en el código. La tabla de la sección 11 del diseño fija el estado "
        "objetivo al 18 de diciembre, no el estado actual: donde las dos difieren, esta "
        "matriz dice qué existe hoy y la tabla, qué queda por delante.",
        "",
        "| Requerimiento | Estado | Evidencia | Motivo |",
        "| --- | --- | --- | --- |",
    ]
    for requirement in requirements:
        label = f"{requirement.identifier} {requirement.title}".strip()
        lines.append(
            f"| {_cell(label)} | {requirement.status} | "
            f"{_evidence(requirement.identifier, trace)} | "
            f"{_cell(requirement.reason or '—')} |"
        )
    return "\n".join(lines).rstrip() + "\n"


def summary(requirements: Sequence[Requirement]) -> str:
    """Resume el número de requerimientos de cada estado."""
    counts = {word: 0 for word in STATUS_WORDS}
    for requirement in requirements:
        counts[requirement.status] += 1
    return (
        f"{len(requirements)} requerimientos: "
        f"{counts['Implementado']} implementados, {counts['Parcial']} parciales, "
        f"{counts['Declarado']} declarados, {counts['Pendiente']} pendientes"
    )


def build_status(root: Path, catalogue: Path, out: Path | None = None) -> int:
    """Genera la matriz de estado y devuelve el código de salida."""
    root = Path(root).resolve()
    catalogue = Path(catalogue)
    if not root.is_dir():
        print(f"Error: la raíz indicada no es un directorio: {root}", file=sys.stderr)
        return 2
    if not catalogue.is_file():
        print(f"Error: no existe el catálogo de requerimientos: {catalogue}", file=sys.stderr)
        return 2
    try:
        requirements = parse_catalogue(catalogue)
        trace = build_map.collect(root, (item.identifier for item in requirements))
        _check_evidence(requirements, trace)
    except build_map.CatalogueError as error:
        print(f"Error: catálogo inválido: {error}", file=sys.stderr)
        return 1
    except build_map.UnknownRequirementError as error:
        build_map.report_unknown(error, catalogue)
        return 1
    out = Path(out) if out is not None else root / DEFAULT_MATRIX
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_status(requirements, trace), encoding="utf-8")
    print(f"Matriz de estado: {out} ({summary(requirements)}).")
    return 0


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada de la línea de comandos."""
    parser = argparse.ArgumentParser(
        description="Genera la matriz de estado de los requerimientos."
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
        help="Archivo de la matriz; por omisión, docs/estado-requerimientos.md bajo la raíz.",
    )
    parser.add_argument(
        "--catalogue",
        type=Path,
        default=None,
        help="Catálogo canónico; por omisión, docs/manual/requerimientos.md del repositorio.",
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    catalogue = args.catalogue if args.catalogue is not None else build_map.default_catalogue()
    out = args.out if args.out is not None else root / DEFAULT_MATRIX
    return build_status(root, catalogue, out)


if __name__ == "__main__":
    raise SystemExit(main())

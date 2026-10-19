"""Verificador de estilo: rechaza emojis y flechas decorativas.

Recorre los mismos archivos de texto que el verificador de autoría y termina
con código 1 cuando encuentra un carácter de las tablas de emoji. En Markdown
también rechaza las flechas del rango U+2190–U+21FF, que se usan como adornos
en lugar de palabras.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

EMOJI_RANGES = (
    (0x1F300, 0x1FAFF),
    (0x2600, 0x27BF),
    (0xFE0F, 0xFE0F),
    (0x2B00, 0x2BFF),
)

ARROW_RANGE = (0x2190, 0x21FF)

MARKDOWN = ".md"

EXTENSIONS = frozenset(
    {".md", ".py", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".json", ".html", ".css", ".txt"}
)

EXCLUDED_DIRS = frozenset(
    {".legacy-project", ".recon", ".agents", ".superpowers", "node_modules", ".venv"}
)

EXCLUDED_SUBPATHS = (("docs", "superpowers"), ("ml", "data"))


@dataclass(frozen=True)
class Violation:
    """Un carácter no permitido encontrado en un archivo."""

    path: Path
    line: int
    codepoint: int


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


def _iter_files(root: Path) -> Iterator[Path]:
    """Recorre los archivos de texto, podando las carpetas excluidas."""
    for directory, subdirectories, filenames in os.walk(root):
        current = Path(directory)
        subdirectories[:] = sorted(
            name
            for name in subdirectories
            if not _is_excluded((current / name).relative_to(root))
        )
        for name in sorted(filenames):
            path = current / name
            if path.suffix.lower() in EXTENSIONS:
                yield path


def _is_forbidden(codepoint: int, markdown: bool) -> bool:
    """Indica si el punto de código cae en un rango no permitido."""
    if any(start <= codepoint <= end for start, end in EMOJI_RANGES):
        return True
    return markdown and ARROW_RANGE[0] <= codepoint <= ARROW_RANGE[1]


def check(root: Path) -> list[Violation]:
    """Devuelve las violaciones de estilo que hay bajo la raíz dada."""
    root = root.resolve()
    violations: list[Violation] = []
    for path in _iter_files(root):
        markdown = path.suffix.lower() == MARKDOWN
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), start=1):
            for character in line:
                codepoint = ord(character)
                if _is_forbidden(codepoint, markdown):
                    violations.append(Violation(path, number, codepoint))
    return violations


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada de la línea de comandos."""
    parser = argparse.ArgumentParser(
        description="Rechaza emojis y flechas decorativas en el repositorio."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("."),
        help="Raíz del árbol que se revisa (por omisión, el directorio actual).",
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    if not root.is_dir():
        print(f"Error: la raíz indicada no es un directorio: {args.root}", file=sys.stderr)
        return 2
    violations = check(root)
    for violation in violations:
        print(
            f"{violation.path.relative_to(root)}:{violation.line}: "
            f"carácter U+{violation.codepoint:04X} no permitido"
        )
    if violations:
        print(f"Violaciones de estilo: {len(violations)}.")
        return 1
    print("Estilo: sin violaciones.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

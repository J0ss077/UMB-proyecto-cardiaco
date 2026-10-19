"""Verificador de autoría: rechaza declaraciones de autoría asistida.

Recorre la capa humana del repositorio y termina con código 1 cuando encuentra
una fórmula que atribuya el trabajo a una herramienta. La palabra "IA" por sí
sola es legítima: el producto es un modelo de IA. Lo que se persigue es la
afirmación de que el trabajo se produjo con asistencia.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

PATTERNS = (
    "generado por ia",
    "asistido por ia",
    "con ayuda de ia",
    "apoyado por ia",
    "escrito por ia",
    "coautor ia",
    "chatgpt",
    "copilot",
    "claude",
    "gpt-",
    "gemini",
    "llm",
    "modelo de lenguaje",
)

EXTENSIONS = frozenset(
    {".md", ".py", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".json", ".html", ".css", ".txt"}
)

EXCLUDED_DIRS = frozenset(
    {".legacy-project", ".recon", ".agents", ".superpowers", "node_modules", ".venv"}
)

EXCLUDED_SUBPATHS = (("docs", "superpowers"), ("ml", "data"))

# El verificador no se escanea a sí mismo: este archivo nombra las fórmulas
# prohibidas como datos de trabajo, no declara autoría.
SELF_PATH = Path(__file__).resolve()

# AGENTS.md de la raíz es capa de agente: es uno de los tres lugares donde cabe
# la mención de autoría, junto con .agents/ y docs/superpowers/. Se exime la
# ruta exacta, no un patrón, para no excusar cualquier AGENTS.md del árbol.
AGENTS_FILE = "AGENTS.md"

# El límite de palabra inicial evita que "llm" coincida dentro de fullmatch y
# que "claude", "gemini" o "copilot" coincidan al final de un identificador más
# largo. La lista de patrones no cambia y el límite final no se exige: "llm"
# debe casar con "LLMs".
_COMPILED = tuple(re.compile(r"\b" + re.escape(pattern)) for pattern in PATTERNS)


@dataclass(frozen=True)
class Violation:
    """Una fórmula de autoría asistida encontrada en un archivo."""

    path: Path
    line: int
    pattern: str


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


def scan(root: Path) -> list[Violation]:
    """Devuelve las violaciones de autoría que hay bajo la raíz dada."""
    root = root.resolve()
    agents_guide = root / AGENTS_FILE
    violations: list[Violation] = []
    for path in _iter_files(root):
        resolved = path.resolve()
        if resolved == SELF_PATH or resolved == agents_guide:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), start=1):
            lowered = line.lower()
            for pattern, compiled in zip(PATTERNS, _COMPILED, strict=True):
                if compiled.search(lowered):
                    violations.append(Violation(path, number, pattern))
    return violations


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada de la línea de comandos."""
    parser = argparse.ArgumentParser(
        description="Rechaza declaraciones de autoría asistida en el repositorio."
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
    violations = scan(root)
    for violation in violations:
        print(
            f"{violation.path.relative_to(root)}:{violation.line}: "
            f"fórmula de autoría asistida: {violation.pattern}"
        )
    if violations:
        print(f"Violaciones de autoría: {len(violations)}.")
        return 1
    print("Autoría: sin violaciones.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

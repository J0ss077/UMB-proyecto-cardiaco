"""@requirement none

Genera los gráficos vectoriales del README en `docs/assets/`.

Cada gráfico se escribe en dos paletas, clara y oscura, a partir de una sola
plantilla, de modo que las dos variantes no se desalineen cuando una cambia. Los
SVG no llevan fondo: se funden con el de GitHub. El README elige la variante con
`<picture>` y `prefers-color-scheme`.

El script usa solo la biblioteca estándar y se ejecuta desde cualquier carpeta:

    python3 scripts/build_readme_assets.py

Las capturas de `docs/assets/interfaz/` no salen de aquí: son capturas de la pila
en ejecución. Para refrescarlas se levanta la pila, se toman en tema claro y
oscuro con las cuentas de demostración y se guardan con esquinas redondeadas.
"""

from __future__ import annotations

import os
from pathlib import Path

OUT = str(Path(__file__).resolve().parents[1] / "docs" / "assets") + os.sep
os.makedirs(OUT + "diagramas", exist_ok=True)

FONT = "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"

PAL = {
    "claro": dict(
        fg="#1f2328", muted="#59636e", faint="#818b98", line="#c3ccd6",
        primary="#0084ff", ptext="#0a62c9", cyan="#0891b2", accent="#3b5ee6",
        crit="#b42318", warn="#a16207", ok="#15803d",
        tile="#0084ff", heart="#ffffff",
    ),
    "oscuro": dict(
        fg="#e6edf3", muted="#9aa4b1", faint="#6e7886", line="#3d4650",
        primary="#38a3ff", ptext="#58b4ff", cyan="#22d3ee", accent="#818cf8",
        crit="#fb7185", warn="#fbbf24", ok="#34d399",
        tile="#38a3ff", heart="#ffffff",
    ),
}


def smooth(points, tension=0.5):
    """Curva suave (Catmull-Rom a Bezier) por los puntos dados."""
    d = f"M{points[0][0]:.1f} {points[0][1]:.1f}"
    for i in range(len(points) - 1):
        p0 = points[i - 1] if i > 0 else points[i]
        p1, p2 = points[i], points[i + 1]
        p3 = points[i + 2] if i + 2 < len(points) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3 * 2 / 2, p1[1] + (p2[1] - p0[1]) * tension / 3 * 2 / 2)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3 * 2 / 2, p2[1] - (p3[1] - p1[1]) * tension / 3 * 2 / 2)
        d += f" C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}"
    return d


def logo(x, y, size, c):
    s = size / 512
    return (
        f'<g transform="translate({x} {y}) scale({s:.4f})">'
        f'<rect width="512" height="512" rx="112" fill="{c["tile"]}"/>'
        f'<path d="M256 400 120 270a72 72 0 0 1 102-102l34 34 34-34a72 72 0 0 1 102 102z" fill="{c["heart"]}"/>'
        f'<path d="M150 272h70l24-44 36 76 24-32h58" fill="none" stroke="{c["tile"]}" stroke-width="22" '
        f'stroke-linecap="round" stroke-linejoin="round"/></g>'
    )


def head(w, h, title, desc):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'role="img" aria-labelledby="t d" font-family="{FONT}">\n'
        f'<title id="t">{title}</title>\n<desc id="d">{desc}</desc>\n'
    )


# ---------------------------------------------------------------- banner

def banner(name, c):
    W, H = 1100, 330
    s = head(W, H, "HipertAI: telemonitoreo de hipertensión arterial",
             "Logotipo de HipertAI junto a una tendencia de presión sistólica y diastólica con umbrales y un trazo de electrocardiograma.")
    s += f"""<defs>
<linearGradient id="word" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{c['primary']}"/><stop offset="1" stop-color="{c['cyan']}"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.18" stop-color="#fff"/><stop offset="0.9" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="690" y="0" width="400" height="300"><rect x="690" y="0" width="400" height="300" fill="url(#fade)"/></mask>
</defs>
"""
    s += logo(70, 48, 96, c)
    s += (f'<text x="184" y="122" font-size="82" font-weight="800" letter-spacing="-2" fill="{c["fg"]}" '
          f'textLength="364" lengthAdjust="spacingAndGlyphs">Hipert<tspan fill="url(#word)">AI</tspan></text>')
    s += (f'<text x="72" y="196" font-size="30" font-weight="650" fill="{c["fg"]}" textLength="530" '
          f'lengthAdjust="spacingAndGlyphs">Telemonitoreo de hipertensión arterial</text>')
    s += (f'<text x="72" y="234" font-size="19" fill="{c["muted"]}" textLength="618" '
          f'lengthAdjust="spacingAndGlyphs">Prototipo de grado - Ingeniería de Software - Universidad Manuela Beltrán</text>')
    chips = [("Registro domiciliario", 226, c["primary"]), ("Consentimiento informado", 252, c["cyan"]), ("Alertas con validación médica", 292, c["accent"])]
    x = 70
    for label, w, col in chips:
        s += (f'<rect x="{x}" y="262" width="{w}" height="40" rx="20" fill="{col}" fill-opacity="0.10" stroke="{col}" stroke-opacity="0.55"/>'
              f'<circle cx="{x + 21}" cy="282" r="5" fill="{col}"/>'
              f'<text x="{x + 38}" y="288" font-size="16.5" font-weight="550" fill="{c["fg"]}" textLength="{w - 56}" lengthAdjust="spacingAndGlyphs">{label}</text>')
        x += w + 12
    xs = [700 + i * 44 for i in range(9)]
    sys_y = [112, 86, 52, 80, 44, 96, 40, 70, 36]
    dia_y = [212, 192, 160, 186, 152, 202, 146, 176, 140]
    ps = smooth(list(zip(xs, sys_y)))
    pd = smooth(list(zip(xs, dia_y)))
    s += '<g mask="url(#m)">'
    for y in (76, 176):
        s += f'<line x1="690" y1="{y}" x2="1090" y2="{y}" stroke="{c["crit"]}" stroke-opacity="0.75" stroke-width="1.6" stroke-dasharray="7 6"/>'
    s += f'<path d="{ps}" fill="none" stroke="{c["primary"]}" stroke-width="4" stroke-linecap="round"/>'
    s += f'<path d="{pd}" fill="none" stroke="{c["cyan"]}" stroke-width="4" stroke-linecap="round"/>'
    for (px, py) in zip(xs, sys_y):
        s += f'<circle cx="{px}" cy="{py}" r="9" fill="{c["primary"]}" fill-opacity="0.16"/><circle cx="{px}" cy="{py}" r="4.6" fill="{c["primary"]}"/>'
    for (px, py) in zip(xs, dia_y):
        s += f'<circle cx="{px}" cy="{py}" r="9" fill="{c["cyan"]}" fill-opacity="0.16"/><circle cx="{px}" cy="{py}" r="4.6" fill="{c["cyan"]}"/>'
    s += "</g>"
    s += (f'<text x="1052" y="24" font-size="15" font-weight="600" fill="{c["primary"]}" text-anchor="end">sistólica</text>'
          f'<text x="1052" y="238" font-size="15" font-weight="600" fill="{c["cyan"]}" text-anchor="end">diastólica</text>')
    s += "</svg>\n"
    return s


# ---------------------------------------------------------------- piezas de diagrama

def node(x, y, w, h, color, title, sub=None, tag=None, c=None, dashed=False, fs=22):
    s = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{color}" fill-opacity="0.09" '
         f'stroke="{color}" stroke-opacity="{0.55 if not dashed else 0.7}" stroke-width="1.6"' + (' stroke-dasharray="7 6"' if dashed else '') + '/>')
    ty = y + 36
    s += f'<text x="{x + 20}" y="{ty}" font-size="{fs}" font-weight="700" fill="{c["fg"]}">{title}</text>'
    if sub:
        for i, line in enumerate(sub):
            s += f'<text x="{x + 20}" y="{ty + 27 + i * 22}" font-size="16.5" fill="{c["muted"]}">{line}</text>'
    if tag:
        tw = 16 + len(tag) * 9
        s += (f'<rect x="{x + w - tw - 14}" y="{y + 14}" width="{tw}" height="24" rx="12" fill="{color}" fill-opacity="0.16"/>'
              f'<text x="{x + w - 14 - tw / 2}" y="{y + 31}" font-size="14" font-weight="600" fill="{c["fg"]}" text-anchor="middle" font-family="{MONO}">{tag}</text>')
    return s


def arrow_def(c):
    return (f'<defs><marker id="ar" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M1 1L9 5L1 9" fill="none" stroke="{c["muted"]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker>'
            f'<marker id="ad" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M1 1L9 5L1 9" fill="none" stroke="{c["faint"]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>\n')


def label(x, y, text, c, anchor="middle", mono=False, size=15):
    fam = f' font-family="{MONO}"' if mono else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{c["muted"]}" text-anchor="{anchor}"{fam}>{text}</text>'


# ---------------------------------------------------------------- arquitectura

def arquitectura(name, c):
    W, H = 1200, 566
    s = head(W, H, "Arquitectura de HipertAI",
             "La interfaz web y los dispositivos hablan con una API FastAPI que guarda el registro clínico en PostgreSQL y el flujo crudo de los dispositivos en MongoDB. El modelo de apoyo a la decisión aún no existe.")
    s += arrow_def(c)
    # entradas
    s += node(30, 70, 290, 150, c["primary"], "Interfaz web", ["React 18 - Vite - TypeScript", "Paciente, médico,", "cuidador y administrador"], ":3000", c)
    s += node(30, 290, 290, 120, c["cyan"], "Dispositivo de medición", ["Tensiómetro e IoT", "Bluetooth, en construcción"], None, c)
    # API
    s += (f'<rect x="440" y="40" width="380" height="370" rx="18" fill="{c["accent"]}" fill-opacity="0.07" stroke="{c["accent"]}" stroke-opacity="0.6" stroke-width="1.8"/>')
    s += f'<text x="464" y="84" font-size="24" font-weight="700" fill="{c["fg"]}">API</text>'
    s += f'<text x="464" y="110" font-size="16.5" fill="{c["muted"]}">FastAPI - Python 3.12</text>'
    tw = 58
    s += (f'<rect x="{820 - 14 - tw - 0}" y="56" width="{tw}" height="24" rx="12" fill="{c["accent"]}" fill-opacity="0.16"/>'
          f'<text x="{820 - 14 - tw / 2}" y="73" font-size="14" font-weight="600" fill="{c["fg"]}" text-anchor="middle" font-family="{MONO}">:8000</text>')
    mods = ["auth", "accounts", "consent", "clinical", "consultations", "adminconsole", "ingest", "audit"]
    for i, m in enumerate(mods):
        col, row = i % 2, i // 2
        x, y = 464 + col * 172, 128 + row * 52
        hi = m == "ingest"
        colr = c["cyan"] if hi else c["accent"]
        s += (f'<rect x="{x}" y="{y}" width="160" height="38" rx="10" fill="{colr}" fill-opacity="{0.15 if hi else 0.08}" stroke="{colr}" stroke-opacity="0.5"/>'
              f'<text x="{x + 80}" y="{y + 25.5}" font-size="16" fill="{c["fg"]}" text-anchor="middle" font-family="{MONO}">{m}</text>')
    s += f'<text x="464" y="370" font-size="15" fill="{c["muted"]}">Un paquete por área, con el router HTTP</text>'
    s += f'<text x="464" y="391" font-size="15" fill="{c["muted"]}">separado de la lógica del servicio.</text>'
    # datos
    s += node(930, 70, 250, 150, c["ok"], "PostgreSQL 16", ["Registro clínico", "16 tablas, 7 enumerados"], None, c)
    s += node(930, 290, 250, 120, c["warn"], "MongoDB 7", ["Flujo crudo de los", "dispositivos"], None, c)
    # modelo pendiente
    s += node(440, 452, 380, 96, c["faint"], "Modelo de apoyo a la decisión", ["Incremento posterior (ml/).", "Todavía no existe."], None, c, dashed=True, fs=19)
    # flechas
    s += f'<path d="M320 145 H440" stroke="{c["muted"]}" stroke-width="1.8" fill="none" marker-end="url(#ar)"/>'
    s += label(380, 130, "HTTP + JSON", c) + label(380, 168, "sesión JWT", c)
    s += f'<path d="M320 350 H392 V303 H464" stroke="{c["muted"]}" stroke-width="1.8" fill="none" marker-end="url(#ar)"/>'
    s += label(356, 340, "POST", c, size=14, mono=True)
    s += label(382, 374, "X-Device-Key", c, size=14, mono=True)
    s += f'<path d="M820 145 H930" stroke="{c["muted"]}" stroke-width="1.8" fill="none" marker-end="url(#ar)"/>'
    s += label(875, 130, "SQL", c)
    s += f'<path d="M820 340 H930" stroke="{c["muted"]}" stroke-width="1.8" fill="none" marker-end="url(#ar)"/>'
    s += label(875, 326, "raw_readings", c, mono=True, size=13.5)
    s += f'<path d="M630 410 V452" stroke="{c["faint"]}" stroke-width="1.8" stroke-dasharray="6 5" fill="none" marker-end="url(#ad)"/>'
    s += "</svg>\n"
    return s


# ---------------------------------------------------------------- ciclo de la alerta

def alerta(name, c):
    W, H = 1100, 320
    s = head(W, H, "Ciclo de una alerta",
             "Una alerta abierta pasa a acuse de recibo, validada o descartada. Solo un médico mueve la alerta y cada paso queda en la auditoría.")
    s += arrow_def(c)
    s += node(30, 110, 230, 96, c["warn"], "Abierta", ["Pendiente de revisión", "médica"], None, c)
    s += node(400, 110, 230, 96, c["primary"], "Acuse de recibo", ["El médico la vio,", "aún sin resolver"], None, c)
    s += node(790, 40, 280, 88, c["ok"], "Validada", ["Confirmada por el médico"], None, c)
    s += node(790, 188, 280, 88, c["faint"], "Descartada", ["Descartada por el médico"], None, c)
    s += f'<path d="M260 158 H400" stroke="{c["muted"]}" stroke-width="1.8" fill="none" marker-end="url(#ar)"/>'
    s += label(330, 146, "acusar recibo", c, size=15)
    s += f'<path d="M630 144 C700 144 720 84 790 84" stroke="{c["muted"]}" stroke-width="1.8" fill="none" marker-end="url(#ar)"/>'
    s += f'<path d="M630 172 C700 172 720 232 790 232" stroke="{c["muted"]}" stroke-width="1.8" fill="none" marker-end="url(#ar)"/>'
    s += label(706, 92, "validar", c, size=15) + label(716, 250, "descartar", c, size=15)
    # directos
    s += f'<path d="M145 110 C145 40 300 18 520 18 C700 18 770 30 790 56" stroke="{c["faint"]}" stroke-width="1.6" stroke-dasharray="6 5" fill="none" marker-end="url(#ad)"/>'
    s += f'<path d="M145 206 C145 280 300 302 520 302 C700 302 770 290 790 262" stroke="{c["faint"]}" stroke-width="1.6" stroke-dasharray="6 5" fill="none" marker-end="url(#ad)"/>'
    s += label(520, 40, "también directo: validar", c, size=15) + label(520, 292, "también directo: descartar", c, size=15)
    s += "</svg>\n"
    return s


# ---------------------------------------------------------------- iconos de rol

def iconos():
    P, C = "#1a8cff", "#14b8d4"
    base = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="{{a}}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">\n'
    ic = {}
    ic["paciente"] = (base.format(a="Paciente") +
        f'<circle cx="32" cy="20" r="9" stroke="{P}"/><path d="M13 54c0-11 8-18 19-18s19 7 19 18" stroke="{P}"/>'
        f'<path d="M22 47h6l3-6 4 10 3-4h4" stroke="{C}"/></svg>\n')
    ic["medico"] = (base.format(a="Médico") +
        f'<circle cx="32" cy="20" r="9" stroke="{P}"/><path d="M13 54c0-11 8-18 19-18s19 7 19 18" stroke="{P}"/>'
        f'<path d="M32 41v10M27 46h10" stroke="{C}"/></svg>\n')
    ic["cuidador"] = (base.format(a="Cuidador") +
        f'<circle cx="24" cy="21" r="8" stroke="{P}"/><path d="M8 54c0-10 7-16 16-16s16 6 16 16" stroke="{P}"/>'
        f'<circle cx="46" cy="28" r="6" stroke="{C}"/><path d="M38 54c0-7 3-12 8-12s10 5 10 12" stroke="{C}"/></svg>\n')
    ic["administrador"] = (base.format(a="Administrador") +
        f'<path d="M32 8l20 7v15c0 13-8 21-20 26C20 51 12 43 12 30V15z" stroke="{P}"/>'
        f'<path d="M23 31l7 7 12-14" stroke="{C}"/></svg>\n')
    return ic


# ---------------------------------------------------------------- franja de tecnologias

def stack(name, c):
    items = [("Python", "3.12", c["primary"]), ("FastAPI", "", c["cyan"]), ("PostgreSQL", "16", c["ok"]), ("MongoDB", "7", c["warn"]),
             ("React", "18", c["primary"]), ("TypeScript", "5.7", c["accent"]), ("Vite", "6", c["cyan"]), ("Tailwind", "3.4", c["primary"]),
             ("Node", "22", c["ok"]), ("Docker Compose", "", c["accent"])]
    nl = [round(8.3 * len(n)) for n, v, _ in items]
    widths = [34 + nl[i] + (14 + round(8 * len(items[i][1])) if items[i][1] else 0) + 12 for i in range(len(items))]
    gap = 10
    row1, row2 = items[:5], items[5:]
    w1, w2 = widths[:5], widths[5:]
    W = max(sum(w1) + gap * 4, sum(w2) + gap * 4) + 4
    H = 92
    s = head(W, H, "Tecnologías", "Python 3.12, FastAPI, PostgreSQL 16, MongoDB 7, React 18, TypeScript 5.7, Vite 6, Tailwind 3.4, Node 22 y Docker Compose.")
    for r, (row, ws) in enumerate(((row1, w1), (row2, w2))):
        total = sum(ws) + gap * (len(ws) - 1)
        x = (W - total) / 2
        y = 6 + r * 44
        for (n, v, col), w in zip(row, ws):
            s += (f'<rect x="{x:.1f}" y="{y}" width="{w}" height="34" rx="17" fill="{col}" fill-opacity="0.10" stroke="{col}" stroke-opacity="0.55"/>'
                  f'<circle cx="{x + 17:.1f}" cy="{y + 17}" r="4.2" fill="{col}"/>')
            tx = x + 30
            i = items.index((n, v, col))
            s += f'<text x="{tx:.1f}" y="{y + 22}" font-size="14" font-weight="650" fill="{c["fg"]}" textLength="{nl[i]}" lengthAdjust="spacingAndGlyphs">{n}</text>'
            if v:
                s += f'<text x="{tx + nl[i] + 8:.1f}" y="{y + 22}" font-size="14" font-weight="500" fill="{c["muted"]}" textLength="{round(8 * len(v))}" lengthAdjust="spacingAndGlyphs">{v}</text>'
            x += w + gap
    s += "</svg>\n"
    return s


def write(path, text):
    with open(OUT + path, "w", encoding="utf-8") as f:
        f.write(text)
    print(path, len(text) // 1024 or 1, "KB")


for nm, col in PAL.items():
    write(f"banner-{nm}.svg", banner(nm, col))
    write(f"diagramas/arquitectura-{nm}.svg", arquitectura(nm, col))
    write(f"diagramas/ciclo-alerta-{nm}.svg", alerta(nm, col))
    write(f"tecnologias-{nm}.svg", stack(nm, col))
for k, v in iconos().items():
    write(f"rol-{k}.svg", v)

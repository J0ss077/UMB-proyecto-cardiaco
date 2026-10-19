"""@requirement RF-01

Auditoría de los eventos de acceso y de sesión.

Expone ``record``, el único punto de escritura de ``audit_logs``: los módulos
que necesiten dejar rastro de una acción pasan por aquí en lugar de componer el
``insert`` cada uno.
"""

from hta.audit.service import record

__all__ = ["record"]

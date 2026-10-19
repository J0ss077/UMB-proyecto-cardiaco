"""@requirement RF-02

Registro público, roles y desactivación de cuentas.

Expone el servicio que crea pacientes, cambia roles y desactiva cuentas, y el
router con los endpoints administrativos correspondientes.
"""

from hta.accounts.service import deactivate, register_patient, set_role

__all__ = ["deactivate", "register_patient", "set_role"]

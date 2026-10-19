"""@requirement RF-03

Consentimiento informado con versionado y bloqueo del monitoreo.

Expone el servicio que registra una aceptación, revoca las aceptaciones
vigentes y responde si hay consentimiento para una versión concreta, y el
router con los endpoints del paciente.
"""

from hta.consent.service import accept, is_active, revoke

__all__ = ["accept", "is_active", "revoke"]

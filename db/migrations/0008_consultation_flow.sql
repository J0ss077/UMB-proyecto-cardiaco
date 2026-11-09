-- La consulta pasa por revisión, reunión y cierre.
--
-- wants_meet dice si el paciente pidió atención por Meet. El estado deja de ser
-- solo pending o answered:
--
--   in_review  el paciente acaba de enviarla
--   pending    el médico ya mandó el enlace y falta el formato
--   completed  el médico envió el formato y el comentario
--
-- Las consultas que estaban pending pasan a in_review, porque el médico todavía
-- no las ha visto. Las answered pasan a completed. La justificación está en
-- docs/adr/0010-revision-reunion-y-cierre-de-la-consulta.md.

ALTER TABLE teleconsultations
    ADD COLUMN wants_meet BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE teleconsultations SET status = 'in_review' WHERE status = 'pending';
UPDATE teleconsultations SET status = 'completed' WHERE status = 'answered';

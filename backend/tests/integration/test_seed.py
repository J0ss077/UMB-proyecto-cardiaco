"""@requirement none

Pruebas de la siembra de datos de demostración.

La siembra es infraestructura, no una funcionalidad: crea las cuentas con las
que se recorre la aplicación y los datos clínicos de los cuatro escenarios. Las
pruebas comprueban las propiedades que sostienen la demostración: las siete
cuentas, la ventana domiciliaria de cada paciente, las señales propias de cada
escenario, los umbrales globales y la idempotencia de una segunda siembra.
"""

import pytest

from hta.db.seed import seed

pytestmark = pytest.mark.integration

PATIENT_EMAILS = {
    "paciente1@hta.demo",
    "paciente2@hta.demo",
    "paciente3@hta.demo",
    "paciente4@hta.demo",
}

# Tablas que la siembra escribe y que no deben cambiar en una segunda pasada.
IDEMPOTENT_TABLES = (
    "readings",
    "symptoms_mood",
    "consents",
    "alerts",
    "caregiver_links",
    "reminders",
    "alert_config",
    "teleconsultations",
    "medications",
    "adherence_events",
    "reports",
)


def _table_counts(db, tables) -> dict[str, int]:
    """Devuelve el recuento de cada tabla pedida."""
    return {
        table: db.execute(f"select count(*) from {table}").fetchone()[0]
        for table in tables
    }


def test_seed_creates_four_scenarios(db):
    ids = seed(db)
    assert set(ids) == {
        "admin",
        "physician",
        "caregiver",
        "patient_out_of_range",
        "patient_alert",
        "patient_revoked",
        "patient_caregiver",
    }
    assert db.execute("select count(*) from users").fetchone()[0] == 7


def test_seed_is_idempotent(db):
    seed(db)
    first = _table_counts(db, IDEMPOTENT_TABLES)
    seed(db)
    assert _table_counts(db, IDEMPOTENT_TABLES) == first


def test_seed_does_not_add_readings_after_a_later_day(db):
    """Una segunda siembra no mueve ni duplica una serie ya existente.

    Se desplazan las lecturas cuarenta días atrás para simular una siembra de
    un día anterior. La guarda es por paciente, así que la segunda pasada no
    encuentra una rejilla libre y deja el recuento intacto.
    """
    seed(db)
    first = db.execute("select count(*) from readings").fetchone()[0]

    db.execute("update readings set measured_at = measured_at - interval '40 days'")
    seed(db)

    assert db.execute("select count(*) from readings").fetchone()[0] == first


def test_every_patient_has_recent_home_window_data(db):
    """Cada paciente tiene al menos ocho lecturas válidas en dos días recientes.

    La ventana se cuenta por días calendario, con hoy incluido, y solo suma
    lecturas con ``validation_status = 'valid'``. La rejilla de la siembra deja
    las lecturas en los días anteriores, así que la consulta encuentra varios
    días con dos mediciones cada uno.
    """
    seed(db)
    rows = db.execute(
        "select u.email, count(r.id), count(distinct r.measured_at::date) "
        "from users u "
        "join patient_profiles p on p.user_id = u.id "
        "left join readings r on r.patient_id = p.id "
        "  and r.validation_status = 'valid' "
        "  and r.measured_at >= date_trunc('day', now()) - interval '6 days' "
        "where u.role = 'patient' "
        "group by u.email"
    ).fetchall()

    assert {row[0] for row in rows} == PATIENT_EMAILS
    for email, total, days in rows:
        assert total >= 8, f"{email} solo tiene {total} lecturas válidas en la ventana"
        assert days >= 2, f"{email} solo tiene lecturas en {days} día(s)"


def test_out_of_range_scenario_keeps_an_implausible_reading(db):
    seed(db)
    implausible = db.execute(
        "select count(*) from readings r "
        "join patient_profiles p on p.id = r.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s "
        "  and r.systolic = 78 and r.diastolic = 46 "
        "  and r.validation_status = 'out_of_range' "
        "  and r.measured_at >= date_trunc('day', now()) - interval '6 days'",
        ("paciente1@hta.demo",),
    ).fetchone()[0]
    assert implausible == 1

    thresholds = dict(
        db.execute(
            "select metric, high_threshold "
            "from alert_config where patient_id is null"
        ).fetchall()
    )
    elevated, elevated_not_valid = db.execute(
        "select count(*), count(*) filter (where r.validation_status <> 'valid') "
        "from readings r "
        "join patient_profiles p on p.id = r.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s "
        "  and (r.systolic > %s or r.diastolic > %s)",
        (
            "paciente1@hta.demo",
            thresholds["systolic"],
            thresholds["diastolic"],
        ),
    ).fetchone()
    assert elevated == 12
    assert elevated_not_valid == 0


def test_alert_scenario_has_open_critical_alert(db):
    seed(db)
    alerts = db.execute(
        "select a.status, a.severity from alerts a "
        "join patient_profiles p on p.id = a.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s",
        ("paciente2@hta.demo",),
    ).fetchall()
    assert alerts == [("open", "critical")]

    critical_readings = db.execute(
        "select count(*) from readings r "
        "join patient_profiles p on p.id = r.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s "
        "  and (r.systolic >= 180 or r.diastolic >= 120)",
        ("paciente2@hta.demo",),
    ).fetchone()[0]
    assert critical_readings >= 1


def test_alert_scenario_has_a_seeded_symptom(db):
    """El escenario crítico deja un síntoma con el texto fijo de la siembra.

    La fila cuelga del paciente que tiene la alerta abierta y conserva el texto
    y el estado de ánimo que documenta el contrato. Los otros dos pacientes con
    consentimiento vigente tienen un síntoma propio; el revocado no.
    """
    seed(db)
    rows = db.execute(
        "select u.email, s.free_text, s.mood "
        "from symptoms_mood s "
        "join patient_profiles p on p.id = s.patient_id "
        "join users u on u.id = p.user_id "
        "join alerts a on a.patient_id = p.id and a.status = 'open'"
    ).fetchall()
    assert rows == [
        ("paciente2@hta.demo", "mareo y dolor de cabeza desde la tarde", "ansioso")
    ]
    assert db.execute("select count(*) from symptoms_mood").fetchone()[0] == 3


def test_revoked_scenario_keeps_one_revoked_consent(db):
    seed(db)
    consents = db.execute(
        "select c.revoked_at from consents c "
        "join patient_profiles p on p.id = c.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s",
        ("paciente3@hta.demo",),
    ).fetchall()
    assert len(consents) == 1
    assert consents[0][0] is not None

    unrevoked = db.execute(
        "select count(*) from consents c "
        "join patient_profiles p on p.id = c.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s and c.revoked_at is null",
        ("paciente3@hta.demo",),
    ).fetchone()[0]
    assert unrevoked == 0


def test_revoked_scenario_revokes_a_preexisting_consent(db):
    """Si la aceptación ya existía sin revocar, la siembra la revoca.

    El escenario promete un consentimiento revocado. Si la fila llegó por otro
    camino y está vigente, se revoca en lugar de dejarla así.
    """
    seed(db)
    db.execute(
        "update consents set revoked_at = null "
        "where patient_id = ("
        "  select p.id from patient_profiles p "
        "  join users u on u.id = p.user_id "
        "  where u.email = %s"
        ")",
        ("paciente3@hta.demo",),
    )

    seed(db)

    row = db.execute(
        "select count(*), count(*) filter (where c.revoked_at is not null) "
        "from consents c "
        "join patient_profiles p on p.id = c.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s",
        ("paciente3@hta.demo",),
    ).fetchone()
    assert row == (1, 1)


def test_caregiver_scenario_links_the_caregiver(db):
    seed(db)
    links = db.execute(
        "select cl.authorized_scope from caregiver_links cl "
        "join patient_profiles p on p.id = cl.patient_id "
        "join users patient on patient.id = p.user_id "
        "join users caregiver on caregiver.id = cl.caregiver_id "
        "where patient.email = %s and caregiver.email = %s",
        ("paciente4@hta.demo", "cuidador@hta.demo"),
    ).fetchall()
    assert links == [("readings",)]

    unrevoked = db.execute(
        "select count(*) from consents c "
        "join patient_profiles p on p.id = c.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = %s and c.revoked_at is null",
        ("paciente4@hta.demo",),
    ).fetchone()[0]
    assert unrevoked >= 1


def test_every_patient_has_profile_and_physician(db):
    seed(db)
    rows = db.execute(
        "select u.email from users u "
        "join patient_profiles p on p.user_id = u.id "
        "join patient_physician pp on pp.patient_id = p.id "
        "join users physician on physician.id = pp.physician_id "
        "where u.role = 'patient' and physician.email = %s",
        ("medico@hta.demo",),
    ).fetchall()
    assert len(rows) == len(PATIENT_EMAILS)
    assert {row[0] for row in rows} == PATIENT_EMAILS


def test_alert_config_has_documented_global_thresholds(db):
    seed(db)
    seed(db)
    rows = db.execute(
        "select metric, low_threshold::int, high_threshold::int, "
        "       critical_low::int, critical_high::int, recipients "
        "from alert_config where patient_id is null order by metric"
    ).fetchall()
    assert rows == [
        ("diastolic", None, 90, None, 120, ["physician"]),
        ("systolic", None, 140, None, 180, ["physician"]),
    ]


def test_every_demo_patient_has_fictitious_contact_data(db):
    seed(db)
    rows = db.execute(
        "select document_number, phone, trusted_contact_phone, trusted_contact_email "
        "from patient_profiles"
    ).fetchall()
    assert len(rows) == 4
    for document_number, phone, trusted_phone, trusted_email in rows:
        assert document_number and phone and trusted_phone
        assert trusted_email.endswith("@example.com")
    assert len({row[0] for row in rows}) == 4


def test_demo_consultations_cover_review_meet_and_checkup(db):
    """Las consultas cubren revisión, reunión pendiente y cierre con formato.

    La del dolor de cabeza queda completada, con enlace de Meet y los cuatro
    textos del chequeo. Una segunda siembra no añade filas.
    """
    seed(db)
    rows = db.execute(
        "select u.email, t.status, t.wants_meet, t.meet_url is not null, "
        "       (t.checkup_general is not null and t.checkup_pressure is not null "
        "        and t.checkup_symptoms is not null and t.checkup_conduct is not null), "
        "       t.response is not null "
        "from teleconsultations t "
        "join patient_profiles p on p.id = t.patient_id "
        "join users u on u.id = p.user_id "
        "order by u.email, t.created_at"
    ).fetchall()
    assert rows == [
        ("paciente1@hta.demo", "completed", False, False, True, True),
        ("paciente2@hta.demo", "completed", True, True, True, True),
        ("paciente2@hta.demo", "pending", True, True, False, False),
        ("paciente2@hta.demo", "in_review", True, False, False, False),
        ("paciente4@hta.demo", "in_review", False, False, False, False),
    ]
    headache = db.execute(
        "select t.response, t.checkup_general is not null "
        "from teleconsultations t "
        "join patient_profiles p on p.id = t.patient_id "
        "join users u on u.id = p.user_id "
        "where u.email = 'paciente2@hta.demo' and t.message = 'Tengo dolor de cabeza desde ayer'"
    ).fetchone()
    assert headache[0] == "Gracias por avisar. Registra tus lecturas de hoy y mañana."
    assert headache[1] is True
    seed(db)
    assert db.execute("select count(*) from teleconsultations").fetchone()[0] == 5


"""Phase 1 test criterion: "Headline contains no banned term. Automated test
with an adversarial fixture designed to bait a causal claim."

Two layers, matching the spec's "do not ship this relying on the prompt
alone" instruction:
  1. The word-list matcher itself (find_banned_term) — every banned term is
     actually caught, and clean sequential text is not falsely flagged.
  2. The end-to-end safety net in regenerate_timeline_cache: even when the
     LLM call is made to RETURN an adversarial completion (simulating a
     model that ignored the system prompt and produced a causal claim), the
     Python validator rejects it and the deterministic fallback ships
     instead — never the raw model output, and never a blank headline.
"""
import pytest

from services.timeline_ai import (
    BANNED_TERMS,
    find_banned_term,
    fallback_headline,
    fallback_domain_summary,
    validate_ai_text,
)

# Deliberately shaped like Marcus's real Jan 14 note ("He's stopping the
# olanzapine and starting him on something else... I think he agreed because
# someone finally said the weight was the drug's fault") — a caregiver may
# say this; the headline must not repeat the causal framing even when the
# underlying note text does.
ADVERSARIAL_CAREGIVER_NOTE = (
    "He stopped taking the medication because of the weight gain, which "
    "triggered the episode that led to the crisis line call."
)


class TestFindBannedTerm:
    def test_detects_causal_language(self):
        assert find_banned_term(
            "He stopped his medication because of the weight gain, which triggered a relapse."
        ) is not None

    def test_detects_diagnostic_language(self):
        assert find_banned_term(
            "These values are consistent with a manic episode and suggest a high risk of relapse."
        ) is not None

    def test_detects_predictive_language(self):
        assert find_banned_term("This pattern is likely to predict another episode soon.") is not None

    def test_passes_clean_sequential_text(self):
        text = (
            "Weight rose from 198 to 217 pounds between Dec 2 and Jan 31. "
            "He stopped his medication on Dec 18. Sleep dropped to under 4 "
            "hours a night by late December."
        )
        assert find_banned_term(text) is None

    @pytest.mark.parametrize("term", BANNED_TERMS)
    def test_every_banned_term_is_individually_caught(self, term):
        found = find_banned_term(f"The report says this {term} the change in mood.")
        assert found is not None and found.lower() == term.lower()

    def test_the_adversarial_note_itself_is_flagged(self):
        assert find_banned_term(ADVERSARIAL_CAREGIVER_NOTE) is not None


class TestFallbackTemplatesAreCleanByConstruction:
    def test_fallback_headline_with_lead_domain(self):
        facts = {
            "range_start": "2025-12-02", "range_end": "2026-01-31",
            "days_logged": 53, "days_in_range": 61,
            "lead_domain": {"label": "Weight", "start": 198, "end": 217},
        }
        assert find_banned_term(fallback_headline(facts)) is None

    def test_fallback_headline_with_no_lead_domain(self):
        facts = {"range_start": "2025-12-02", "range_end": "2026-01-31", "days_logged": 0, "days_in_range": 61, "lead_domain": None}
        assert find_banned_term(fallback_headline(facts)) is None

    def test_fallback_domain_summary(self):
        facts = {"label": "Weight", "days_logged": 8, "days_in_range": 61, "note_count": 3}
        assert find_banned_term(fallback_domain_summary(facts)) is None


class TestEndToEndValidatorRejectsAnAdversarialModelOutput:
    """Simulates an LLM that ignored the system prompt and returned a causal
    claim. Even in that failure mode, regenerate_timeline_cache must never
    store or serve it."""

    def test_regeneration_falls_back_when_llm_output_is_adversarial(self, db, monkeypatch):
        import models
        from services.timeline_ai import regenerate_timeline_cache
        from datetime import date

        caregiver = models.User(email="advtest.caregiver@example.com", password_hash="x", name="Adv Caregiver", role=models.UserRole.caregiver)
        db.add(caregiver)
        db.flush()
        patient = models.Patient(name="Adv Test Patient", caregiver_id=caregiver.id, is_demo=True, diagnosis="test")
        db.add(patient)
        db.flush()
        db.add(models.DailyLog(
            patient_id=patient.id, logged_by=caregiver.id, date=date(2026, 1, 14),
            symptoms=[{"name": "Anxiety", "severity": 8}],
            notes=ADVERSARIAL_CAREGIVER_NOTE,
        ))
        db.commit()
        patient_id = patient.id
        db.close()

        monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake-key-not-a-real-call")

        def fake_generate_headline(facts, api_key, timeout=8.0):
            return ADVERSARIAL_CAREGIVER_NOTE

        def fake_generate_domain_summary(facts, api_key, timeout=8.0):
            return ADVERSARIAL_CAREGIVER_NOTE

        monkeypatch.setattr("services.timeline_ai.generate_headline", fake_generate_headline)
        monkeypatch.setattr("services.timeline_ai.generate_domain_summary", fake_generate_domain_summary)

        regenerate_timeline_cache(patient_id)

        from database import SessionLocal
        check_db = SessionLocal()
        try:
            cache = check_db.query(models.TimelineCache).filter(models.TimelineCache.patient_id == patient_id).first()
            assert cache is not None
            windows = cache.content.get("windows", {})
            assert windows, "expected content cached for every window"
            for window_key, window_content in windows.items():
                assert window_content.get("headline"), f"{window_key} headline missing"
                assert find_banned_term(window_content["headline"]) is None, f"{window_key} headline"
                assert window_content["headline"] != ADVERSARIAL_CAREGIVER_NOTE
                for domain in window_content.get("domains", {}).values():
                    assert find_banned_term(domain["summary"]) is None
                    assert domain["summary"] != ADVERSARIAL_CAREGIVER_NOTE
        finally:
            check_db.close()

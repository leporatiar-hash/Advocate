"""Caregiver feedback fixes: side effects are never judged expected/unexpected,
and episodes carry their result and next steps into the summary data."""
import inspect

from services.aggregation import _episode_for_prompt


def test_summary_prompt_never_labels_side_effects_expected():
    from routers import summary
    src = inspect.getsource(summary)
    assert "[unexpected]" not in src and "[known side effect]" not in src


def test_episode_for_prompt_includes_result_and_next_steps():
    ep = {"occurred": True, "description": "Very tired, slept 17h", "outcome": "held_at_home",
          "next_steps": ["Contact the doctor", "Request a plasma level"]}
    assert _episode_for_prompt(ep) == {
        "what_happened": "Very tired, slept 17h", "result": "handled at home",
        "next_steps": ["Contact the doctor", "Request a plasma level"],
    }
    assert _episode_for_prompt({**ep, "outcome": "Called his psychiatrist"})["result"] == "Called his psychiatrist"
    assert _episode_for_prompt({"occurred": False}) is None

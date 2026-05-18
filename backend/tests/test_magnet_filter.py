from app.contracts import FilterRules
from app.javdb_models import JavdbMagnet
from app.services.magnet_filter import BYTES_PER_GB, MagnetFilter


def test_rejects_below_min_size() -> None:
    rules = FilterRules(min_size_gb=2, required_keywords=[], excluded_keywords=[])
    magnet = JavdbMagnet("sample", "magnet:?xt=urn:btih:test", BYTES_PER_GB)

    decision = MagnetFilter(rules).evaluate([magnet])[0]

    assert decision.decision == "rejected"
    assert decision.reason == "below_min_size"


def test_prefers_larger_matching_magnet() -> None:
    rules = FilterRules(min_size_gb=1, required_keywords=["字幕"], excluded_keywords=["广告"])
    small = JavdbMagnet("字幕 2GB", "magnet:?xt=urn:btih:small", 2 * BYTES_PER_GB)
    large = JavdbMagnet("字幕 5GB", "magnet:?xt=urn:btih:large", 5 * BYTES_PER_GB)

    best = MagnetFilter(rules).choose_best(MagnetFilter(rules).evaluate([small, large]))

    assert best is not None
    assert best.magnet.url.endswith("large")

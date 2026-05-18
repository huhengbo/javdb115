from __future__ import annotations

from dataclasses import dataclass

from app.contracts import FilterRules
from app.javdb_models import JavdbMagnet

BYTES_PER_GB = 1024**3


@dataclass(frozen=True)
class MagnetDecision:
    magnet: JavdbMagnet
    decision: str
    reason: str
    score: int


class MagnetFilter:
    def __init__(self, rules: FilterRules) -> None:
        self.rules = rules

    def evaluate(self, magnets: list[JavdbMagnet]) -> list[MagnetDecision]:
        return [self._evaluate_one(magnet) for magnet in magnets]

    def choose_best(self, decisions: list[MagnetDecision]) -> MagnetDecision | None:
        accepted = [decision for decision in decisions if decision.decision == "accepted"]
        if not accepted:
            return None
        return max(accepted, key=lambda item: item.score)

    def _evaluate_one(self, magnet: JavdbMagnet) -> MagnetDecision:
        text = magnet.name.lower()
        min_bytes = int(self.rules.min_size_gb * BYTES_PER_GB)
        if magnet.size_bytes is not None and magnet.size_bytes < min_bytes:
            return MagnetDecision(magnet, "rejected", "below_min_size", 0)
        excluded = self._matched_keyword(text, self.rules.excluded_keywords)
        if excluded:
            return MagnetDecision(magnet, "rejected", f"excluded_keyword:{excluded}", 0)
        missing = self._missing_required(text)
        if missing:
            return MagnetDecision(magnet, "rejected", f"missing_keyword:{missing}", 0)
        return MagnetDecision(magnet, "accepted", "matched_rules", self._score(magnet))

    def _missing_required(self, text: str) -> str | None:
        for keyword in self.rules.required_keywords:
            if keyword.lower() not in text:
                return keyword
        return None

    def _matched_keyword(self, text: str, keywords: list[str]) -> str | None:
        for keyword in keywords:
            if keyword.lower() in text:
                return keyword
        return None

    def _score(self, magnet: JavdbMagnet) -> int:
        size_score = int((magnet.size_bytes or 0) / BYTES_PER_GB)
        keyword_score = sum(
            10 for keyword in self.rules.required_keywords if keyword in magnet.name
        )
        return size_score + keyword_score

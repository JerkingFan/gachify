"""LRC parser shared by worker and CLI."""

from __future__ import annotations

import re
from typing import Any, Dict, List

_TIME = re.compile(r"\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]")


def parse_lrc_text(raw: str) -> Dict[str, Any]:
    lines: List[Dict[str, Any]] = []
    for row in raw.splitlines():
        row = row.strip()
        if not row:
            continue
        stamps = list(_TIME.finditer(row))
        if not stamps:
            continue
        text = _TIME.sub("", row).strip()
        if not text:
            continue
        for m in stamps:
            minute = int(m.group(1))
            second = int(m.group(2))
            frac = m.group(3)
            ms = 0
            if frac:
                n = int(frac)
                ms = n * 10 if len(frac) == 2 else n
            start_ms = (minute * 60 + second) * 1000 + ms
            lines.append({"start_ms": start_ms, "text": text})
    return {"lines": lines, "format": "lrc", "source": "lrc"}

#!/usr/bin/env python3
"""Build a privacy-aware profile archive from RootsMagic descendant reports."""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
UPLOAD = ROOT.parent / "upload"
OUTPUT = ROOT / "archive-data.json"

REPORTS = [
    ("brimage-gatling", "Descendants of Minger Brimage and Maria Gatling.pdf", "Descendants of Minger Brimage and Maria Gatling"),
    ("thomas-pinn", "Descendant Report - Thomas Pinn.pdf", "Descendants of Thomas Pinn"),
    ("edward-turner", "Descendant Report - Edward Turner.pdf", "Descendants of Edward Turner"),
    ("patrick-lee", "Descendant Report - Patrick Lee.pdf", "Descendants of Patrick Lee"),
]

STOP_NAMES = {
    "Generation", "Generation Con T", "More About", "Notes For", "Page", "Index",
    "Descendants Of", "No First Name", "Thursday February", "RootsMagic Document",
}


def fold(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)).lower()


def clean_name(raw: str) -> str:
    value = re.sub(r"\s+", " ", raw).strip(" ,.;:-")
    value = re.sub(r"^(?:[ivxlcdm]+)\.\s+", "", value, flags=re.I)
    value = re.sub(r"\.\s+(?:He|She|They)\b.*$", "", value)
    value = re.sub(r"^\d+\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+", "", value)
    value = re.sub(r"(?<=[A-Za-z])\d+(?=\s|$)", "", value)
    value = re.sub(r"(?<=\s)\d+(?=\s)", "", value)
    value = re.sub(r"(?:\d+,?)+$", "", value).strip()
    value = re.sub(r"\s+\((?:son|daughter|wife|husband)\b.*$", "", value, flags=re.I)
    if value.isupper():
        value = value.title().replace("Mc ", "Mc")
    return value


def canonical(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", fold(name))


def valid_name(name: str) -> bool:
    if not (2 <= len(name) <= 80) or name in STOP_NAMES:
        return False
    words = name.split()
    if not (1 <= len(words) <= 8):
        return False
    bad = {"was", "born", "died", "married", "following", "children", "child", "residence", "occupation", "county", "generation"}
    if "ancestry.com" in fold(name) or re.match(r"^\d", name):
        return False
    if fold(name) in {"he", "she", "they", "unknown"}:
        return False
    return not any(fold(w).strip("().") in bad for w in words)


def clean_text(text: str) -> str:
    text = re.sub(r"Page \d+ of \d+.*?(?=\n|$)", " ", text)
    text = re.sub(r"Descendants of [^\n]+", " ", text)
    text = re.sub(r"Generation \d+(?: \(con't\))?", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_years(text: str) -> list[str]:
    return sorted(set(re.findall(r"\b(?:16|17|18|19|20)\d{2}\b", text)))


def extract_places(text: str) -> list[str]:
    found = []
    for match in re.finditer(r"\bin\s+([A-Z][A-Za-z.' -]+(?:,\s*[A-Z][A-Za-z. -]+){0,2})(?=[.;]|\s+(?:He|She|They|More|and\s+[A-Z]))", text):
        place = re.sub(r"\s+", " ", match.group(1)).strip(" ,")
        if 2 < len(place) < 80 and not re.search(r"\b(?:the following|Generation|Residence)\b", place, re.I):
            found.append(place)
    return sorted(set(found))[:12]


def birth_year(text: str) -> int | None:
    match = re.search(r"\bwas born\b.{0,55}?\b((?:16|17|18|19|20)\d{2})\b", text, re.I)
    return int(match.group(1)) if match else None


def death_year(text: str) -> int | None:
    match = re.search(r"\b(?:died|buried)\b.{0,55}?\b((?:16|17|18|19|20)\d{2})\b", text, re.I)
    return int(match.group(1)) if match else None


def extract_name_from_block(block: str) -> str | None:
    head = clean_text(block[:420])
    boundary = re.search(r"\s+(?:was born|died|married|had the following|Notes for|More About)\b", head, re.I)
    candidate = head[:boundary.start()] if boundary else head
    for paren in re.finditer(r"\s+\(", candidate):
        prefix = candidate[:paren.start()]
        remainder = candidate[paren.start():]
        first_close = remainder.find(")")
        first_inside = remainder[1:first_close] if first_close > 0 else remainder[1:]
        if re.search(r"\d(?:,\d+)*$", prefix) or "," in first_inside or re.search(r"\d", first_inside):
            candidate = prefix
            break
    candidate = clean_name(candidate)
    return candidate if valid_name(candidate) else None


def add_record(records: dict, name: str, narrative: str, report_id: str, report_title: str, page: int, role: str):
    name = clean_name(name)
    if not valid_name(name):
        return
    key = canonical(name)
    if not key:
        return
    narrative = clean_text(narrative)
    narrative = narrative.split(" had the following child", 1)[0].strip()
    by = birth_year(narrative)
    dy = death_year(narrative)
    restricted = bool(by and by >= 1926 and not dy)
    record = records.setdefault(key, {
        "id": key,
        "name": name,
        "aliases": [],
        "birthYear": None,
        "deathYear": None,
        "years": [],
        "places": [],
        "facts": [],
        "sources": [],
        "restricted": False,
        "recordType": role,
    })
    if name != record["name"] and name not in record["aliases"]:
        record["aliases"].append(name)
    record["birthYear"] = record["birthYear"] or by
    record["deathYear"] = record["deathYear"] or dy
    record["restricted"] = record["restricted"] or restricted
    source = {"reportId": report_id, "title": report_title, "page": page}
    if source not in record["sources"]:
        record["sources"].append(source)
    if not restricted:
        record["years"] = sorted(set(record["years"] + extract_years(narrative)))
        record["places"] = sorted(set(record["places"] + extract_places(narrative)))[:20]
        fact = narrative[:900].strip()
        if fact and fact not in record["facts"]:
            record["facts"].append(fact)


def process_report(records: dict, report_id: str, filename: str, title: str):
    with pdfplumber.open(UPLOAD / filename) as pdf:
        pages = [page.extract_text(x_tolerance=2, y_tolerance=3) or "" for page in pdf.pages]
    text = "\f".join(pages)
    starts = list(re.finditer(r"(?m)^\s*(\d{1,3})\.\s+", text))
    for i, match in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        block = text[match.end():end]
        name = extract_name_from_block(block)
        if not name:
            continue
        page = text.count("\f", 0, match.start()) + 1
        if report_id == "brimage-gatling" and page > 35:
            continue
        add_record(records, name, block, report_id, title, page, "numbered profile")

        # Add unnumbered child entries as linked minimal profiles.
        child_section = re.search(r"had the following child(?:ren)?:\s*(.*)", block, re.I | re.S)
        if child_section:
            child_text = child_section.group(1)
            child_entries = list(re.finditer(r"(?m)^\s*(?:[ivxlcdm]+)\.\s+", child_text, re.I))
            for j, child_match in enumerate(child_entries):
                child_end = child_entries[j + 1].start() if j + 1 < len(child_entries) else len(child_text)
                child_block = child_text[child_match.end():child_end]
                child_name = extract_name_from_block(child_block)
                if child_name:
                    child_page = page + child_text.count("\f", 0, child_match.start())
                    add_record(records, child_name, child_block, report_id, title, child_page, "child entry")

        # Capture spouses named in the profile even when they have no numbered entry.
        for spouse in re.finditer(r"\b(?:He|She) married(?:\s+\(\d+\))?\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,6})(?=\s+(?:on|in|about|before|after)|[.,])", clean_text(block)):
            spouse_name = spouse.group(1)
            context = clean_text(block)[max(0, spouse.start() - 80): spouse.end() + 240]
            add_record(records, spouse_name, context, report_id, title, page, "spouse entry")


def main():
    records = {}
    for report in REPORTS:
        process_report(records, *report)

    profiles = sorted(records.values(), key=lambda p: fold(p["name"]))
    for profile in profiles:
        profile["sources"].sort(key=lambda s: (s["title"], s["page"]))
        if profile["restricted"]:
            profile["facts"] = []
            profile["places"] = []
            profile["years"] = []
            profile["birthYear"] = None
            profile["deathYear"] = None
        else:
            profile["facts"] = profile["facts"][:5]

    facets = {
        "names": [p["name"] for p in profiles],
        "places": sorted({place for p in profiles for place in p["places"]}, key=fold),
        "dates": sorted({year for p in profiles for year in p["years"]}),
    }
    payload = {
        "generatedFrom": [r[2] for r in REPORTS],
        "profileCount": len(profiles),
        "restrictedCount": sum(1 for p in profiles if p["restricted"]),
        "profiles": profiles,
        "facets": facets,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "profiles": len(profiles), "restricted": payload["restrictedCount"], "places": len(facets["places"]), "dates": len(facets["dates"])}))


if __name__ == "__main__":
    main()

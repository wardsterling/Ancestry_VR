#!/usr/bin/env python3
"""Enrich the private archive with report-cited generations and parent-child links.

Uses layout-preserving text extracted from the original reports. Never infers
kinship from ages, surnames, nearby paragraphs, or an ancestry name chain.
"""
import json
import re
from collections import defaultdict
from build_archive import ROOT, UPLOAD, REPORTS, canonical, clean_name, extract_name_from_block

ORDINALS = 'First Second Third Fourth Fifth Sixth Seventh Eighth Ninth Tenth Eleventh Twelfth'.split()


def parse_report(text, report_id, title, known):
    memberships, edges = [], []
    generation, parent, parent_generation, children, page = None, None, None, False, 1
    # Form feeds in the source mark PDF pages. Preserve them while joining wraps.
    lines = text.replace('\f', '\n\f\n').split('\n')
    for i, line in enumerate(lines):
        if '\f' in line:
            page += 1
            continue
        if report_id == 'brimage-gatling' and page > 35:
            break  # Endnotes/index are not descendant entries.
        heading = re.search(r'^\s*(?:Generation (\d+)|(' + '|'.join(ORDINALS) + r') Generation)', line)
        if heading:
            generation = int(heading[1]) if heading[1] else ORDINALS.index(heading[2]) + 1
            continue
        main = re.match(r'^\s*(\d+)\.\s+(.*)', line)
        child = re.match(r'^\s*(?:\d+\.?\s+)?[ivxlcdm]+\.\s+(.*)', line, re.I)
        # Numbered children contain a Roman ordinal after the report number.
        if main and re.match(r'[ivxlcdm]+\.\s', main[2], re.I):
            main = None
        if main or child:
            raw = (main[2] if main else child[1])
            # Some names wrap; stop at the first fact or explicit parent clause.
            raw += ' ' + ' '.join(lines[i+1:i+3])
            raw = re.split(r',?\s+(?:was born|born|died|married|Notes for|More About|had the following)\b|\s+\((?:son|daughter) of', raw, maxsplit=1, flags=re.I)[0]
            raw = re.split(r'\s+\((?=[^)]*(?:\d|,))', raw, maxsplit=1)[0]
            # Brimage's one-line root has no date; don't swallow following lines.
            if main and not re.search(r'\b(?:was|born|died|married)\b|\(', main[2], re.I):
                raw = main[2]
            raw = re.sub(r'(?<=[A-Za-z)])\d[\d,–-]*(?=\s|$)', '', raw)
            name = clean_name(raw)
            profile_id = canonical(name)
            if main:
                parent = profile_id if profile_id in known else None
                parent_generation, children = generation, False
                g = generation
            else:
                g = parent_generation + 1 if children and parent_generation else None
            if profile_id in known and g and not known[profile_id]['restricted']:
                memberships.append(dict(profileId=profile_id, reportId=report_id, generation=g, page=page, title=title))
                if child and children and parent and parent != profile_id and not known[parent]['restricted']:
                    edges.append(dict(parentId=parent, childId=profile_id, reportId=report_id, page=page))
        # A child list is only active after an explicit list heading in this profile.
        if re.search(r'had the\s+following child', line + ' ' + (lines[i+1] if i+1 < len(lines) else ''), re.I):
            children = bool(parent)
    return memberships, edges


def build():
    archive = json.loads((ROOT / 'archive-data.json').read_text())
    known = {p['id']: p for p in archive['profiles']}
    memberships, edges = [], []
    for report_id, filename, title in REPORTS:
        text = (UPLOAD / filename.replace('.pdf', '.txt')).read_text()
        m, e = parse_report(text, report_id, title, known)
        memberships.extend(m)
        edges.extend(e)
    # Retain evidence and expose conflicts instead of choosing a guessed generation.
    memberships = list({(m['profileId'], m['reportId'], m['generation'], m['page']): m for m in memberships}.values())
    generations = defaultdict(set)
    for m in memberships:
        generations[m['profileId'], m['reportId']].add(m['generation'])
    edges = [e for e in edges if len(generations[e['parentId'], e['reportId']]) == 1
             and len(generations[e['childId'], e['reportId']]) == 1
             and next(iter(generations[e['childId'], e['reportId']])) == next(iter(generations[e['parentId'], e['reportId']])) + 1]
    edges = list({(e['parentId'], e['childId'], e['reportId']): e for e in edges}.values())
    payload = dict(version=1, basis='Compiled report entries; family review required', memberships=memberships, edges=edges)
    (ROOT / 'archive-tree.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(mappedProfiles=len({m['profileId'] for m in memberships}), memberships=len(memberships), links=len(edges), conflicts=sum(len(g)>1 for g in generations.values()))))


if __name__ == '__main__':
    build()

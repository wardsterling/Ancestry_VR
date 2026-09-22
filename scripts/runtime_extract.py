"""Run the existing report parser in Python or Pyodide; no network or subprocesses.

Inputs are layout text and geometry read from originals. All earlier reports are
reparsed together so cross-report identities and family links use the same rules.
"""
import copy
import hashlib
import json
import re
from types import SimpleNamespace
import extract_reports as reports
from source_media_rules import adjacent_entry


def _rebuild(payload):
    previous = payload['archive']
    inputs = payload['inputs']
    added = payload['added']
    documents = copy.deepcopy(previous.get('documents', []))
    if any(d['sha256'] == added['sha256'] for d in documents):
        raise ValueError('This original PDF is already incorporated in the archive.')
    documents.append(added)
    reports.REPORTS = [(d['id'], d['id']+'.pdf', d['title']) for d in documents]
    ex = reports.Extractor()
    for doc in documents:
        text = inputs[doc['id']]['text']
        ex.parse(text, (doc['id'], doc['id']+'.pdf', doc['title']))
    ex.resolve()
    archive, tree, audit = ex.output(previous)
    result = reports.validate(archive, tree, payload.get('checks'))
    for report in audit['reports']:
        if report['numberedCandidates'] != report['numberedEntries'] or report['childCandidates'] != report['childEntries']:
            result['errors'].append('Incomplete entry coverage: '+report['reportId'])
    fatal = [i for i in ex.issues if i['type'].startswith(('unparsed', 'unresolved-family', 'child-without', 'reference-name', 'self-link'))]
    if fatal:
        result['errors'].append('Some report entries or family headings need review before import.')
    new_profiles = [p for p in archive['profiles'] if any(s['reportId'] == added['id'] for s in p['sources'])]
    if not new_profiles:
        result['errors'].append('No supported descendant-report entries were found. The original is saved; this report needs transcription or a supported report layout.')
    result['passed'] = not result['errors']
    if not result['passed']:
        return {'error': '; '.join(result['errors']), 'issues': fatal[:20]}
    aliases = archive.get('idAliases', {})
    people = {p['id']: p for p in archive['profiles']}
    def resolve(pid):
        targets = aliases.get(pid, {}).get('targets', [pid])
        return targets[0] if len(targets) == 1 and targets[0] in people else None
    private = ex.private_details
    old_private = payload.get('privateDetails', {}).get('profiles', {})
    # Preserve existing source portraits through stable IDs and evidence-based merges.
    for old in previous['profiles']:
        pid = resolve(old['id'])
        if not pid:
            continue
        portrait = old.get('portrait') or old_private.get(old['id'], {}).get('portrait')
        if portrait:
            if people[pid]['restricted']:
                private.setdefault(pid, {})['portrait'] = copy.deepcopy(portrait)
            else:
                people[pid].setdefault('portrait', copy.deepcopy(portrait))
    index = copy.deepcopy(payload.get('sourcePeople', {'version': 1, 'sourceHashes': {}, 'pages': {}}))
    for doc_id, pages in index['pages'].items():
        for page, marks in pages.items():
            keep = []
            for mark in marks:
                ids = list(dict.fromkeys(resolve(pid) for pid in mark['profileIds']))
                ids = [pid for pid in ids if pid and any(s['reportId'] == doc_id and s['page'] == int(page) for s in people[pid]['sources'])]
                if ids:
                    keep.append({**mark, 'profileIds': ids})
            pages[page] = keep
    index['sourceHashes'][added['id']] = added['sha256']
    index['pages'][added['id']] = {}
    unidentified = copy.deepcopy(previous.get('unidentifiedPortraits', []))
    image_count = assigned_count = 0
    for page in payload['geometry']:
        number, width, height = page['page'], page['width'], page['height']
        lines = page['lines']
        cited = [p for p in new_profiles if any(s['reportId'] == added['id'] and s['page'] == number for s in p['sources'])]
        marks = []
        for line in lines:
            text = re.sub(r'^\s*(?:\d+\.?\s*)?(?:[ivx]+\.\s*)?', '', line['text'], flags=re.I)
            ids = [p['id'] for p in cited if any(re.match(reports.name_pattern(n)+r'(?=\s|\(|,|\d|$)', text, re.I) for n in [p['name']]+p.get('aliases', []))]
            if ids:
                x0,y0,x1,y1 = line['bbox']
                marks.append({'rect': [max(0,x0/width*100), max(0,y0/height*100), min(width-x0,x1-x0)/width*100, min(height-y0,y1-y0)/height*100], 'profileIds': list(dict.fromkeys(ids))})
        index['pages'][added['id']][str(number)] = marks
        for region in page['regions']:
            image_count += 1
            x0,y0,x1,y1 = region['bbox']
            rect = SimpleNamespace(x0=x0,y0=y0,x1=x1,y1=y1)
            match = adjacent_entry(rect, lines, cited, added['id'], number, private)
            if not match:
                match = adjacent_entry(rect, lines, new_profiles, added['id'], number, private)
            evidence = {'reportId': added['id'], 'page': number, 'bbox': region['bbox']}
            if match:
                pid, anchor = match
                portrait = {'src': region['src'], 'source': evidence, 'basis': 'Adjacent printed name: '+anchor}
                if people[pid]['restricted']:
                    private.setdefault(pid, {}).setdefault('portrait', portrait)
                else:
                    people[pid].setdefault('portrait', portrait)
                assigned_count += 1
            else:
                rid = hashlib.sha256((added['sha256']+str(number)+str(region['bbox'])).encode()).hexdigest()[:24]
                unidentified.append({'id': 'report-'+rid, 'kind': 'report', 'title': 'Unidentified report portrait', 'reportId': added['id'], 'page': number, 'rect': [x0/width*100,y0/height*100,(x1-x0)/width*100,(y1-y0)/height*100], 'notes':'', 'claims':[], 'evidence':[], 'unidentifiedPeople':False})
    archive['documents'] = documents
    archive['unidentifiedPortraits'] = unidentified
    archive['livingDetailsAvailable'] = True
    archive['validation'] = {k:v for k,v in result.items() if k not in {'checks','errors','warnings'}}
    archive['validation']['reports'] = len(documents)
    archive['validation']['reviewItems'] = len(ex.issues)+len(audit['conflictingClaims'])+len(result['warnings'])
    archive['validation']['identityReviewCount'] = sum(bool(p.get('identityReview')) for p in people.values())
    archive['mediaSummary'] = {'profilesWithPortraits': sum(bool(p.get('portrait') or private.get(p['id'],{}).get('portrait')) for p in people.values()), 'sourceImages': previous.get('mediaSummary',{}).get('sourceImages',0)+image_count, 'unassignedImages':len(unidentified)}
    snapshot = hashlib.sha256(json.dumps([archive,tree], sort_keys=True).encode()).hexdigest()
    archive['snapshotId'] = tree['snapshotId'] = index['snapshotId'] = snapshot
    imported = {'itemId': added['importItemId'], 'reportId': added['id'], 'sha256': added['sha256'], 'people':len(new_profiles), 'pictures':image_count, 'assignedPictures':assigned_count, 'unidentifiedPictures':image_count-assigned_count}
    return {'archive':archive, 'tree':tree, 'privateDetails':{'snapshotId':snapshot, 'profiles':private}, 'sourcePeople':index, 'inputs':inputs, 'imported':imported}


def rebuild(payload):
    original_reports=reports.REPORTS
    try:
        return _rebuild(payload)
    finally:
        reports.REPORTS=original_reports

#!/usr/bin/env python3
"""Rebuild report-scoped people and cited family relationships from original PDFs.

stdlib + pdftotext (Poppler). Compiled reports are evidence, not independent proof.
No family records or person-specific corrections are embedded in this module.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
REPORTS = [
    ('brimage-gatling', 'Descendants of Minger Brimage and Maria Gatling.pdf', 'Descendants of Minger Brimage and Maria Gatling'),
    ('thomas-pinn', 'Descendant Report - Thomas Pinn.pdf', 'Descendants of Thomas Pinn'),
    ('edward-turner', 'Descendant Report - Edward Turner.pdf', 'Descendants of Edward Turner'),
    ('patrick-lee', 'Descendant Report - Patrick Lee.pdf', 'Descendants of Patrick Lee'),
]
ORDINALS = 'First Second Third Fourth Fifth Sixth Seventh Eighth Ninth Tenth Eleventh Twelfth'.split()
MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()


def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c)).lower()


def compact(s):
    return re.sub(r'\s+', ' ', s).strip()


def strip_parens(s, all_groups=False):
    out, block, depth = '', '', 0
    for c in s:
        if c == '(':
            depth += 1
            block += c
        elif depth:
            block += c
            if c == ')':
                depth -= 1
                if not depth:
                    if not all_groups and not re.search(r'\d|\b(?:son|daughter|wife|husband)\b', block, re.I):
                        out += block
                    block = ''
        else:
            out += c
    return out


def clean_name(s):
    s = strip_parens(s)
    s = re.sub(r'(?<=[A-Za-z)])\d[\d,–-]*(?=\s|$)', '', s)
    s = re.sub(r'\b\d+\b', '', s)
    s = compact(s).strip(' ,;:.-')
    if s.isupper():
        s = s.title()
    s = re.sub(r'\b(Ii|Iii|Iv)\b', lambda m: m[0].upper(), s)
    return s


def name_key(s):
    return re.sub('[^a-z]', '', fold(strip_parens(clean_name(s), True)))


def loose_key(s):
    return re.sub(r'(?:jr|sr)$', '', name_key(s))


def name_pattern(s):
    words=re.findall(r"[A-Za-z’'-]+",strip_parens(s,True))
    return r'[\s.]+(?:\([^)]*\)\s*)?'.join(re.escape(w) for w in words)+r'\.?'


def child_starts(text):
    # Location abbreviations such as a wrapped "DC." are not Roman ordinals.
    return list(re.finditer(r'(?m)^[ \t]*(?:(\d{1,3})\.?[ \t]+)?([ivx]{1,6})\.[ \t]+(.*)',text,re.I))


def valid_name(s):
    words = s.split()
    return (1 <= len(words) <= 9 and 2 <= len(s) <= 100
            and not re.search(r'\b(?:was|born|died|married|had|following|children|notes|about|generation|page|residence|occupation|preparer|email)\b|https?://|@', s, re.I)
            and name_key(s) not in {'he', 'she', 'they', 'unknown', 'none'})


def head_name(raw):
    # A wrapped ancestor list is removed as a balanced group, preserving nicknames.
    raw = compact(raw)
    event = re.search(r',?\s+\b(?:was born|born|died|married|met|were married|had the following|Notes for|More About|was buried)\b', raw, re.I)
    if event:
        raw = raw[:event.start()]
    depth, start = 0, None
    for i, char in enumerate(raw):
        if char == '(':
            if not depth:
                start = i
            depth += 1
        elif char == ')' and depth:
            depth -= 1
            if not depth and re.search(r'\d|\b(?:son|daughter)\b', raw[start:i+1], re.I):
                result = clean_name(raw[:start])
                return result if valid_name(result) else None
    raw = re.split(r'\.\s+(?:He|She)\b', raw, 1)[0]
    m = re.search(r',?\s+\b(?:was born|born|died|married|met|were married|had the following|Notes for|More About|was buried)\b', raw, re.I)
    head = raw[:m.start()] if m else raw
    result = clean_name(head)
    return result if valid_name(result) else None


def citation(report, page, quote, **extra):
    return dict(reportId=report[0], title=report[2], page=page, quote=compact(quote)[:650], **extra)


def parse_date(s):
    month = r'(?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)'
    m = re.search(r'\b(?:(about|abt\.?|before|after|circa|c\.?)\s+)?(' + month + r'\s+\d{1,2},?\s+[12]\d{3}|\d{1,2}\s+' + month + r'\s+[12]\d{3}|' + month + r'\s+[12]\d{3}|[12]\d{3})\b', s, re.I)
    if not m:
        return None
    qualifier = (m[1] or '').lower().replace('abt.', 'about').replace('abt', 'about')
    if qualifier in {'c', 'c.'}:
        qualifier = 'circa'
    raw, year = m[2], int(re.search(r'[12]\d{3}', m[2])[0])
    tokens = raw.replace(',', '').split()
    key = str(year)
    if len(tokens) == 3:
        try:
            mo = next(i+1 for i, name in enumerate(MONTHS) if any(t.lower().startswith(name.lower()) for t in tokens))
            day = int(next(t for t in tokens if t.isdigit() and len(t) < 4))
            key = date(year, mo, day).isoformat()
        except (ValueError, StopIteration):
            return None
    return dict(value=(qualifier+' '+raw).strip(), year=year, key=key, qualifier=qualifier, end=m.end())


def vitals(raw):
    text = compact(raw)
    text = re.split(r'\b(?:He|She) (?:married|met)\b|\b(?:were married|had the following|More About|Notes for)\b', text, maxsplit=1, flags=re.I)[0]
    # Do not reach into a second named person's biography.
    boundary = re.search(r'[.;]\s*[\d, -]*(?:[A-Z][A-Za-z’\'-]+\s+){1,6}[A-Z][A-Za-z’\'-]+[\d,–-]*(?:\s+\([^)]*\))?\s+(?:was born|died)\b', text)
    if boundary:
        text = text[:boundary.start()]
    result = {}
    for kind, pattern in [('birth', r'\b(?:was born|born)\b'), ('death', r'\b(?:He died|She died|died)\b')]:
        m = re.search(pattern, text, re.I)
        if not m:
            continue
        clause = text[m.end():]
        clause = re.sub(r'\b(St|Ft|Mt|abt|c)\.', r'\1', clause, flags=re.I)
        clause = re.split(r'[.;]|\b(?:He|She)\b|,?\s+married\b', clause, maxsplit=1)[0]
        d = parse_date(clause)
        if d:
            result[kind+'Date'] = d['value']
            result[kind+'Year'] = d['year']
            result[kind+'Key'] = d['key'] if not d['qualifier'] else '~'+d['key']
        location = re.search(r'\bin\s+([A-Z][^;]+)', clause)
        # Child summaries say "born on DATE, PLACE" instead of "in PLACE".
        if not location and d:
            location = re.match(r'\s*,\s*([A-Z].*)', clause[d['end']:])
        if location:
            place = re.sub(r'\s*\d[\d,–-]*$', '', location[1].strip()).strip(' ,.')
            if 3 < len(place) < 160 and not parse_date(place):
                result[kind+'Place'] = place
    return result


def attributed_vitals(name, raw):
    prefix=compact(strip_parens(raw, True))
    event=re.search(r'\b(?:was born|born|died)\b',prefix,re.I)
    if not event:
        return {}
    head=re.sub(r'\b(?:He|She)\s*$','',prefix[:event.start()],flags=re.I).strip(' ,.;')
    # Names-only entries must not inherit the next paragraph's life events.
    return vitals(raw) if name_key(head)==name_key(name) else {}


def parent_names(raw):
    # A parent clause is attached immediately to this person's name, never to a spouse.
    prefix = re.split(r'\b(?:was born|born|died|married|met|had the following|More About|Notes for)\b',compact(raw),1,flags=re.I)[0]
    m = re.search(r'\(([^()]*(?:son|daughter) of[^()]*)\)', prefix, re.I)
    if not m:
        return []
    body = m[1]
    out = []
    for part in re.split(r'\s+and\s+', body):
        kind = 'step-parent' if re.search(r'\bstep\b', part, re.I) else 'adoptive-parent' if re.search(r'\badopted\b', part, re.I) else 'biological-parent' if re.search(r'\bbiological\b', part, re.I) else 'reported-parent'
        name = clean_name(re.sub(r'^.*?\b(?:son|daughter) of\s+', '', part, flags=re.I))
        if valid_name(name):
            out.append((name, kind))
    return out


def inline_partners(text):
    """Partner facts only inside their own marriage paragraph, before child lists."""
    children=child_starts(text)
    if children:
        text=text[:children[0].start()]
    starts=list(re.finditer(r'(?:\b(?:He|She)\s+|;\s*)(?:married|met)(?:\s+\(\d+\))?\s+',text,re.I))
    for i,m in enumerate(starts):
        tail=text[m.end():starts[i+1].start() if i+1<len(starts) else len(text)]
        tail=re.split(r'had\s+the\s+following\s+child|More About|Notes for',tail,1,flags=re.I)[0]
        lead=compact(tail)
        lead=re.sub(r'\b(Jr|Sr)\.',r'\1',lead,flags=re.I)
        lead=re.sub(r'\b([A-Z])\.(?=\s+[A-Z])',r'\1',lead)
        name=head_name(re.split(r'\s+(?:on|in|about|before|after)\s+|\.',lead,1)[0])
        if not name:
            continue
        own=re.search(r'\b(?:He|She)\s+was\s+born\b',tail)
        clause=re.match(name_pattern(name)+r'\s*(\([^()]*(?:son|daughter) of[^()]*\))',compact(tail),re.I)
        raw=name+(' '+clause[1] if clause else '')+(' '+tail[own.start():] if own else '')
        raw=raw.replace(' He was born',' was born',1).replace(' She was born',' was born',1)
        yield name,raw,m.start()


class DSU:
    def __init__(self):
        self.parent = {}
    def find(self, x):
        self.parent.setdefault(x, x)
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]
    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.parent[max(a, b)] = min(a, b)


class Extractor:
    def __init__(self):
        self.records = {}
        self.edges = []
        self.issues = []
        self.dsu = DSU()
        self.report_stats = []
        self.private_details = {}
        self.duplicate_merges = []

    def record(self, sid, name, raw, source, role, generation=None):
        if not name:
            self.issues.append(dict(type='unparsed-name', source=source))
            return None
        r = self.records.setdefault(sid, dict(sid=sid, name=name, names=set(), claims=[], sources=[], generations=[], parentNames=[], parentClaims=[],role=role))
        r['names'].add(name)
        r['claims'].append(attributed_vitals(name,raw))
        r['sources'].append(source)
        r['parentNames'].extend(parent_names(raw))
        r['parentClaims'].extend((n,k,source) for n,k in parent_names(raw))
        if generation:
            r['generations'].append(dict(reportId=source['reportId'], generation=generation, page=source['page'], title=source['title']))
        self.dsu.find(sid)
        return sid

    def parse(self, text, report):
        lines, generation = [], None
        paragraph_start=True
        for page, content in enumerate(text.split('\f'), 1):
            for raw in content.splitlines():
                line = raw.strip()
                if not line:
                    paragraph_start=True
                    continue
                if re.fullmatch(r'Sources|Endnotes|Name Index|Index', line, re.I):
                    break
                if re.match(r'^Preparer:|^Prepared by', line, re.I):
                    break
                if re.match(r'^Email:|^Address:', line):
                    continue
                if re.match(r'^Descendants of |^Page \d+ of |^\d+$', line):
                    continue
                g = re.match(r'^(?:Generation (\d+)|('+'|'.join(ORDINALS)+r') Generation)', line)
                if g:
                    generation = int(g[1]) if g[1] else ORDINALS.index(g[2])+1
                    continue
                if line and generation:
                    lines.append(dict(text=raw, page=page, generation=generation,paragraphStart=paragraph_start))
                    paragraph_start=False
            else:
                continue
            break
        starts = []
        for i, line in enumerate(lines):
            m = re.match(r'^[ \t]*(\d{1,3})\.[ \t]+(.*)', line['text'])
            if m and not re.match(r'[ivxlcdm]+\.\s+', m[2], re.I):
                candidate=head_name(' '.join([m[2]]+[x['text'] for x in lines[i+1:i+4]])) or head_name(re.sub(r'\bwas\s*$','',m[2]))
                if candidate and not re.match(r'^(?:Was|He|She|They|Notes|More|Page|In|The)\b',m[2],re.I):
                    starts.append((i, int(m[1]), m[2]))
        mains, blocks = {}, []
        for j, (start, number, head) in enumerate(starts):
            end = starts[j+1][0] if j+1<len(starts) else len(lines)
            block = lines[start:end]
            block[0] = {**block[0], 'text':head}
            joined = '\n'.join(x['text'] for x in block)
            # Root names without a narrative occupy their own physical line.
            first = joined if re.search(r'\b(?:was born|died|born|married|met)\b|\(', head, re.I) else head
            name = head_name(first[:1000])
            sid = f'{report[0]}:person:{number}'
            source = citation(report, block[0]['page'], compact(joined)[:600], recordNumber=number)
            self.record(sid, name, joined, source, 'numbered profile', block[0]['generation'])
            if name:
                mains[number] = sid
                blocks.append((sid, block, joined))
        # Each block is handled after all numbered identities have been registered.
        for root, block, joined in blocks:
            root_record = self.records[root]
            offsets, pos = [], 0
            for line in block:
                offsets.append((pos, line['page']))
                pos += len(line['text'])+1
            page_at = lambda offset: next((p for o,p in reversed(offsets) if o<=offset), block[0]['page'])
            flat = compact(joined)
            spouses = {}
            def add_spouse(name, raw, page):
                if not name or not valid_name(name) or name_key(name)==name_key(root_record['name']):
                    return None
                sid = f'{root}:partner:{name_key(name)}'
                self.record(sid, name, raw, citation(report,page,raw,contextId=root), 'partner entry', block[0]['generation'])
                self.records[sid]['partnerOf']=root
                spouses[name_key(name)] = sid
                return sid
            # Inline partner statements from the numbered person's own biography.
            for name,raw,offset in inline_partners(joined):
                add_spouse(name,raw,page_at(offset))
            # Family headers and named marriage statements identify additional partners.
            root_pattern = name_pattern(root_record['name'])
            for m in re.finditer(root_pattern+r'\s+and\s+(.{2,140}?)\s+(?:were married|had the following child)', flat, re.I):
                partner = clean_name(m[1])
                add_spouse(partner, partner, block[0]['page'])
            # Partner biographies in the older report format: "Maria ... was born".
            for sid in list(spouses.values()):
                p = self.records[sid]
                pattern = r'^[ \t]*'+name_pattern(p['name'])+r'[\d,–-]*(?:\s+\([^\n]*?\))?\s+(?:was born|died)\b'
                for m in re.finditer(pattern, joined, re.I|re.M):
                    raw = joined[m.start():]
                    self.record(sid,p['name'],raw,citation(report,page_at(m.start()),raw), 'partner entry',block[0]['generation'])
            candidates = [root]+list(spouses.values())
            headers = []
            for m in re.finditer(r'had\s+the\s+following\s+child(?:ren)?\s*:', joined, re.I):
                prefix = compact(joined[max(0,m.start()-300):m.start()])
                found = None
                for other in spouses.values():
                    names = [root_record['name'],self.records[other]['name']]
                    for a,b in [names,names[::-1]]:
                        if name_key(prefix).endswith(name_key(a)+'and'+name_key(b)):
                            found=[root,other]
                            break
                    if found:
                        break
                if not found:
                    single=name_key(prefix).endswith(name_key(root_record['name'])) and ' and ' not in prefix[-len(root_record['name'])-10:].lower()
                    if not single:
                        self.issues.append(dict(type='unresolved-family-heading',source=citation(report,page_at(m.start()),prefix)))
                    found=[root]  # A one-parent list is valid; never invent the missing partner.
                headers.append((m.end(),found,citation(report,page_at(m.start()),prefix+' had the following children:')))
            children = child_starts(joined)
            for j,m in enumerate(children):
                end = children[j+1].start() if j+1<len(children) else len(joined)
                next_header = next((h[0] for h in headers if h[0]>m.start()),end)
                raw = joined[m.start():min(end,next_header)]
                raw = raw[raw.find(m[3]):]
                # A later union belongs to the numbered person, not their last child.
                union=re.search(root_pattern+r'\s+and\s+.{2,140}?\s+(?:were married|had\s+the\s+following)',raw,re.I|re.S)
                if union:
                    raw=raw[:union.start()]
                name = head_name(raw[:900])
                if not name:
                    self.issues.append(dict(type='unparsed-child',source=citation(report,page_at(m.start()),raw)))
                    continue
                header = next((h for h in reversed(headers) if h[0]<m.start()),None)
                if not header:
                    self.issues.append(dict(type='child-without-family-heading',source=citation(report,page_at(m.start()),raw)))
                    continue
                local = f'{root}:child:{j+1}'
                source = citation(report,page_at(m.start()),raw,parentContextId=root,childOrdinal=m[2],referenceNumber=int(m[1]) if m[1] else None)
                self.record(local,name,raw,source,'child entry',block[0]['generation']+1)
                for partner,bio,offset in inline_partners(raw):
                    partner_id=local+':partner:'+name_key(partner)
                    self.record(partner_id,partner,bio,citation(report,page_at(m.start()+offset),bio,contextId=local),'partner entry',block[0]['generation']+1)
                    self.records[partner_id]['partnerOf']=local
                if m[1] and int(m[1]) in mains:
                    target=mains[int(m[1])]
                    if target!=root and loose_key(name)==loose_key(self.records[target]['name']):
                        self.dsu.union(local,target)
                    else:
                        self.issues.append(dict(type='reference-name-mismatch',source=source,target=target))
                parents=parent_names(raw)
                self.records[local]['familyContext'] = header[1]
                for parent in header[1]:
                    self.edges.append(dict(parent=parent,child=local,kind='family-group',source=header[2],childSource=source))
        # Some reports print a named biography without a marriage statement or
        # numbered entry. Retain that person without inventing a family role.
        known={name_key(n) for r in self.records.values() if r['sources'][0]['reportId']==report[0] for n in r['names']}
        for root,block,joined in blocks:
            pattern=r'(?m)^[ \t]*((?:[A-Z][A-Za-z.\u2019\'-]*[ \t]+){1,7}[A-Z][A-Za-z.\u2019\'-]*[\d,]*)(?:[ \t]+\([^)]*\))?\s+(?:was born|died)\b'
            for match in re.finditer(pattern,joined):
                raw=joined[match.start():]
                name=head_name(raw)
                if (not name or len(name.split())<2 or name_key(name) in known
                    or name_key(name)!=name_key(match[1])
                    or re.search(r'\b(?:He|She|They|In)\b',match[1])
                    or re.search(r'\b[A-Za-z]{3,}\.\s',match[1])):
                    continue
                offset=0;page=block[0]['page'];entry_line=block[0]
                for line in block:
                    if offset>match.start():
                        break
                    page=line['page'];entry_line=line;offset+=len(line['text'])+1
                if not entry_line.get('paragraphStart'):
                    continue
                sid=f'{root}:standalone:{name_key(name)}'
                self.record(sid,name,raw,citation(report,page,raw),'standalone entry')
                known.add(name_key(name))
        self.report_stats.append(dict(reportId=report[0], title=report[2], numberedEntries=len(mains), numberedCandidates=len(starts),
            childEntries=sum(r['role']=='child entry' and r['sources'][0]['reportId']==report[0] for r in self.records.values()),
            childCandidates=len(child_starts('\n'.join(l['text'] for l in lines))),
            extractedRecords=sum(r['sources'][0]['reportId']==report[0] for r in self.records.values())))

    def resolve(self):
        # Explicit date + name or explicit parent pair + year corroborate identity;
        # name alone never merges records. Numbered child references already bind above.
        def one_claim(r,key):
            vals={c[key] for c in r['claims'] if key in c}
            return next(iter(vals)) if len(vals)==1 else None
        def merge_signatures(report_scoped):
            groups=defaultdict(list)
            for sid,r in self.records.items():
                birth=one_claim(r,'birthKey')
                parents=tuple(sorted(name_key(n) for n,_ in r['parentNames']))
                evidence=('date',birth) if birth and re.fullmatch(r'\d{4}-\d{2}-\d{2}',birth) else ('parents-year',tuple(sorted(set(parents))),birth) if birth and len(set(parents))==2 else None
                if evidence:
                    groups[(r['sources'][0]['reportId'] if report_scoped else '',loose_key(r['name']),evidence)].append(sid)
            for ids in groups.values():
                for sid in ids[1:]:
                    a,b=self.dsu.find(ids[0]),self.dsu.find(sid)
                    if a==b:
                        continue
                    if any({self.dsu.find(e['parent']),self.dsu.find(e['child'])}=={a,b} for e in self.edges):
                        self.issues.append(dict(type='identity-merge-blocked-by-relationship',candidates=[a,b]))
                        continue
                    self.dsu.union(ids[0],sid)
        def checked_union(a,b,reason):
            a,b=self.dsu.find(a),self.dsu.find(b)
            if a==b:
                return False
            members=[r for sid,r in self.records.items() if self.dsu.find(sid) in {a,b}]
            for field in ['birthKey','deathKey','birthPlace','deathPlace']:
                values={fold(str(c[field])).lstrip('~') for r in members for c in r['claims'] if c.get(field)}
                if field.endswith('Key'):
                    conflict=any(not (x.startswith(y) or y.startswith(x)) for x in values for y in values)
                else:
                    conflict=len(values)>1
                if conflict:
                    return False
            children=defaultdict(set)
            for edge in self.edges:
                children[self.dsu.find(edge['parent'])].add(self.dsu.find(edge['child']))
            def reaches(start,target):
                pending=list(children[start]);seen=set()
                while pending:
                    node=pending.pop()
                    if node==target:
                        return True
                    if node not in seen:
                        seen.add(node);pending.extend(children[node])
                return False
            if reaches(a,b) or reaches(b,a):
                return False
            self.duplicate_merges.append(dict(reason=reason,sourceIds=sorted(r['sid'] for r in members),sources=[s for r in members for s in r['sources']]))
            self.dsu.union(a,b)
            return True
        def merge_partners(checked=False):
            groups={}
            for sid,r in self.records.items():
                if r.get('partnerOf'):
                    key=(self.dsu.find(r['partnerOf']),name_key(r['name']))
                    if key in groups:
                        if checked:
                            checked_union(groups[key],sid,'same named partner of one resolved person')
                        else:
                            self.dsu.union(groups[key],sid)
                    else:
                        groups[key]=sid
        merge_partners()
        merge_signatures(True)
        merge_partners()
        # Resolve explicitly named parents against the local family context first.
        lookup=defaultdict(set)
        for sid,r in self.records.items():
            for name in r['names']:
                lookup[r['sources'][0]['reportId'],name_key(name)].add(sid)
        for sid,r in list(self.records.items()):
            for name,kind,source in r['parentClaims']:
                context=r.get('familyContext',[])
                matches=[p for p in context if name_key(self.records[p]['name'])==name_key(name)]
                if not matches:
                    matches=list(lookup[source['reportId'],name_key(name)])
                matches=[p for p in matches if self.dsu.find(p)!=self.dsu.find(sid)]
                clusters={self.dsu.find(p) for p in matches}
                if len(clusters)==1:
                    parent=next(iter(clusters))
                elif not matches:
                    parent=f"{source['reportId']}:named-parent:{name_key(name)}"
                    self.record(parent,name,name,source,'named parent')
                    lookup[source['reportId'],name_key(name)].add(parent)
                else:
                    self.issues.append(dict(type='ambiguous-named-parent',name=name,source=source,candidates=sorted(clusters)))
                    continue
                self.edges.append(dict(parent=parent,child=sid,kind=kind,source=source))
        merge_signatures(False)
        merge_partners()
        # Repeated descendant reports often omit living children's dates. Resolve
        # duplicates only when BOTH explicit parents are already the same identities
        # and the reports place the child at the same ordinal in that family.
        while True:
            before=len({self.dsu.find(sid) for sid in self.records})
            parents=defaultdict(set)
            for edge in self.edges:
                if edge['kind'] in {'reported-parent','biological-parent'}:
                    parents[self.dsu.find(edge['child'])].add(self.dsu.find(edge['parent']))
            clusters=defaultdict(list)
            for sid,r in self.records.items():
                clusters[self.dsu.find(sid)].append(r)
            groups=defaultdict(list)
            for cid,members in clusters.items():
                names={name_key(r['name']) for r in members}
                ordinals={s['childOrdinal'] for r in members for s in r['sources'] if s.get('childOrdinal')}
                if len(parents[cid])!=2 or len(names)!=1 or len(ordinals)!=1:
                    continue
                if any(re.search(r'\b(?:unknown|unnamed|baby|infant|no first name)\b',r['name'],re.I) or len(r['name'].split())<2 for r in members):
                    continue
                key=(next(iter(names)),tuple(sorted(parents[cid])),next(iter(ordinals)))
                groups[key].append(cid)
            for candidates in groups.values():
                for cid in candidates[1:]:
                    checked_union(candidates[0],cid,'same name, two resolved explicit parents, and child ordinal')
            merge_partners(checked=True)
            if len({self.dsu.find(sid) for sid in self.records})==before:
                break

    def output(self, previous):
        clusters=defaultdict(list)
        for sid in self.records:
            clusters[self.dsu.find(sid)].append(self.records[sid])
        key_clusters=defaultdict(set)
        for cid,rs in clusters.items():
            for r in rs:
                for name in r['names']:
                    key_clusters[name_key(name)].add(cid)
        ids={}
        prior_for_cluster=defaultdict(set)
        clusters_for_prior=defaultdict(set)
        for sid,old_id in previous.get('sourceIdMap',{}).items():
            if sid in self.records:
                cid=self.dsu.find(sid)
                prior_for_cluster[cid].add(old_id)
                clusters_for_prior[old_id].add(cid)
        for cid,rs in clusters.items():
            best=sorted(rs,key=lambda r:(r['role']!='numbered profile',r['sid']))[0]
            base=name_key(best['name'])
            prior=prior_for_cluster[cid]
            stable=next(iter(prior)) if len(prior)==1 else None
            ids[cid]=stable if stable and len(clusters_for_prior[stable])==1 else base if len(key_clusters[base])==1 else base+'--'+hashlib.sha256(cid.encode()).hexdigest()[:10]
        id_for=lambda sid:ids[self.dsu.find(sid)]
        profiles, memberships, conflicts=[],[],[]
        for cid,rs in clusters.items():
            best=sorted(rs,key=lambda r:(r['role']!='numbered profile',r['sid']))[0]
            claims=defaultdict(set)
            sources=[]
            for r in rs:
                for c in r['claims']:
                    for k,v in c.items():
                        claims[k].add(v)
                sources.extend(r['sources'])
                memberships.extend(dict(profileId=ids[cid],**g) for g in r['generations'])
            def value(k):
                values=claims[k]
                if k.endswith('Date') and len(claims[k.replace('Date','Key')])==1:
                    return sorted(values,key=lambda s:(len(s),s))[0] if values else None
                return next(iter(values)) if len(values)==1 else None
            by,dy=value('birthYear'),value('deathYear')
            restricted=not dy and (not by or by>=date.today().year-100)
            fields={k:value(k) for k in ['birthDate','birthYear','birthPlace','deathDate','deathYear','deathPlace']}
            if restricted:
                self.private_details[ids[cid]]={**fields,'years':sorted({str(y) for y in [by,dy] if y}),
                    'places':sorted({fields[k] for k in ['birthPlace','deathPlace'] if fields[k]})}
            fields={k:(None if restricted else v) for k,v in fields.items()}
            for k,values in claims.items():
                if len(values)>1 and k.endswith(('Key','Place')):
                    conflicts.append(dict(profileId=ids[cid],field=k,values=sorted(values,key=str)))
            sources=list({(s['reportId'],s['page'],s.get('recordNumber'),s['quote']):s for s in sources}.values())
            safe_sources=[{k:v for k,v in s.items() if k!='quote'} for s in sources]
            facts=[] if restricted else list(dict.fromkeys(s['quote'] for s in sources if not re.search(r'@|\bEmail:|\bAddress:',s['quote'])))[:6]
            p=dict(id=ids[cid],name=best['name'],aliases=sorted({n for r in rs for n in r['names']} - {best['name']}),restricted=restricted,extractionVersion=2,
                   conflictingFields=[c['field'] for c in conflicts if c['profileId']==ids[cid]],identityReview=len(key_clusters[name_key(best['name'])])>1,
                   recordType=best['role'],sources=safe_sources,facts=facts,years=[] if restricted else sorted({str(y) for y in [by,dy] if y}),places=[] if restricted else sorted({fields[k] for k in ['birthPlace','deathPlace'] if fields[k]}),**fields)
            profiles.append(p)
        relationships=defaultdict(list)
        for e in self.edges:
            a,b=id_for(e['parent']),id_for(e['child'])
            if a==b:
                self.issues.append(dict(type='self-link-rejected',source=e['source']))
                continue
            relationships[a,b].append(e)
        edges=[]
        for (a,b),es in relationships.items():
            for report_id in sorted({e['source']['reportId'] for e in es}):
                selected=[e for e in es if e['source']['reportId']==report_id]
                explicit=[e for e in selected if e['kind']!='family-group']
                types={e['kind'] for e in explicit if e['kind']!='reported-parent'}
                kind='disputed-parent' if len(types)>1 else next(iter(types)) if types else 'reported-parent' if explicit else 'family-group'
                if len(types)>1:
                    self.issues.append(dict(type='conflicting-parentage',parentId=a,childId=b,reportId=report_id,kinds=sorted(types)))
                evidence=[]
                for e in selected:
                    evidence.append({**e['source'],'relationshipKind':e['kind']})
                    if e.get('childSource'):
                        evidence.append({**e['childSource'],'relationshipKind':e['kind']})
                evidence=list({(s['reportId'],s['page'],s['quote'],s['relationshipKind']):s for s in evidence}.values())
                edges.append(dict(parentId=a,childId=b,reportId=report_id,page=evidence[0]['page'],kind=kind,evidence=evidence))
        # Preserve old links, disambiguating previously merged same-name identities.
        aliases={}
        retained=0
        for old in previous.get('profiles',[]):
            candidates={ids[c] for c in clusters_for_prior.get(old['id'],set())}
            if not candidates:
                for n in [old['name']]+old.get('aliases',[]):
                    candidates.update(ids[c] for c in key_clusters.get(name_key(n),set()))
            if candidates:
                if candidates!={old['id']}:
                    aliases[old['id']]=dict(name=old['name'],targets=sorted(candidates))
            else:
                # Keep old URLs/identities visible, but quarantine unvalidated facts.
                p={**old,'extractionVersion':2,'facts':[],'places':[],'years':[],'birthYear':None,'deathYear':None,'birthDate':None,'deathDate':None,'birthPlace':None,'deathPlace':None,'reviewStatus':'unmatched-legacy','recordType':'legacy profile awaiting source match'}
                profiles.append(p)
                retained+=1
        for old_id,alias in previous.get('idAliases',{}).items():
            targets={new for target in alias['targets'] for new in aliases.get(target,{'targets':[target]})['targets']}
            if targets!={old_id}:
                aliases[old_id]=dict(name=alias['name'],targets=sorted(targets))
        memberships=list({(m['profileId'],m['reportId'],m['generation'],m['page']):m for m in memberships}.values())
        payload=dict(schemaVersion=2,profiles=sorted(profiles,key=lambda p:fold(p['name'])),profileCount=len(profiles),restrictedCount=sum(p['restricted'] for p in profiles),generatedFrom=[r[2] for r in REPORTS],idAliases=aliases,sourceIdMap={sid:id_for(sid) for sid in self.records})
        tree=dict(version=2,basis='Explicit report statements and family-group lists; not independently verified',memberships=memberships,edges=edges)
        audit=dict(reports=self.report_stats,issues=self.issues,conflictingClaims=conflicts,retainedLegacyProfiles=retained,legacyRedirects=len(aliases),duplicateMerges=self.duplicate_merges)
        return payload,tree,audit


def validate(archive,tree,checks=None):
    people={p['id']:p for p in archive['profiles']}
    errors=[]
    warnings=[]
    if len(people)!=len(archive['profiles']):
        errors.append('Duplicate stable profile IDs')
    for p in people.values():
        if p['restricted'] and (p.get('facts') or p.get('years') or p.get('places') or any(p.get(k) for k in ['birthDate','birthYear','birthPlace','deathDate','deathYear','deathPlace'])):
            errors.append('Restricted profile contains displayable life details')
        if p.get('birthYear') and p.get('deathYear') and p['birthYear']>p['deathYear']:
            warnings.append(dict(type='death-before-birth',profileId=p['id']))
    for alias in archive.get('idAliases',{}).values():
        if not alias['targets'] or any(target not in people for target in alias['targets']):
            errors.append('Broken legacy profile link')
    generations=defaultdict(set)
    for m in tree['memberships']:
        if m['profileId'] not in people or not isinstance(m['generation'],int) or m['generation']<1:
            errors.append('Invalid generation membership')
        generations[m['reportId'],m['profileId']].add(m['generation'])
    for (report,pid),values in generations.items():
        if len(values)>1:
            warnings.append(dict(type='multiple-report-generations',profileId=pid,reportId=report,generations=sorted(values)))
    for e in tree['edges']:
        if e['parentId'] not in people or e['childId'] not in people:
            errors.append('Dangling relationship endpoint')
        if e['parentId']==e['childId']:
            errors.append('Self-parent relationship')
        if not e.get('evidence') or not all(s.get('page',0)>0 and s.get('reportId') for s in e['evidence']):
            errors.append('Relationship without source citation')
        parent,child=people.get(e['parentId'],{}),people.get(e['childId'],{})
        if e['kind'] in {'reported-parent','biological-parent'} and parent.get('birthYear') and child.get('birthYear'):
            age=child['birthYear']-parent['birthYear']
            if not 12<=age<=85:
                warnings.append(dict(type='parent-age-review',parentId=e['parentId'],childId=e['childId'],reportId=e['reportId']))
    for report in {'all reports'}|{e['reportId'] for e in tree['edges']}:
        graph=defaultdict(set)
        for e in tree['edges']:
            if (report=='all reports' or e['reportId']==report) and e['kind']!='family-group':
                graph[e['parentId']].add(e['childId'])
        colors={}
        def visit(node):
            if colors.get(node)==1:
                errors.append('Reported-parent cycle: '+report)
                return
            if colors.get(node)==2:
                return
            colors[node]=1
            for child in graph[node]:
                visit(child)
            colors[node]=2
        for node in list(graph):
            visit(node)
    critical=[]
    for check in (checks or {}).get('checks',[]):
        subjects=[p for p in people.values() if name_key(p['name'])==name_key(check['subject'])]
        if len(subjects)!=1:
            errors.append('Critical subject is not uniquely resolved: '+check['subject'])
            continue
        subject=subjects[0]['id']
        found=set()
        for e in tree['edges']:
            if check.get('reportId') and e['reportId']!=check['reportId']:
                continue
            if check.get('kind') and e['kind']!=check['kind']:
                continue
            key,target=('childId','parentId') if check['direction']=='parents' else ('parentId','childId')
            if e[key]==subject:
                found.add(name_key(people[e[target]]['name']))
        expected={name_key(n) for n in check['expected']}
        ok=found==expected
        critical.append(dict(label=check['label'],passed=ok,actual=sorted(found),expected=sorted(expected)))
        if not ok:
            errors.append('Critical family check failed: '+check['label'])
    return dict(passed=not errors,errors=sorted(set(errors)),warnings=warnings,checks=critical,profiles=len(people),citedRelationships=len(tree['edges']),reports=len(REPORTS))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-dir',type=Path,default=ROOT.parent/'upload')
    parser.add_argument('--output-dir',type=Path,default=ROOT)
    parser.add_argument('--previous',type=Path,default=ROOT/'archive-data.json')
    parser.add_argument('--checks',type=Path,default=ROOT/'rebuild-checks.json')
    parser.add_argument('--include-private-details',action='store_true',help='Write a separate owner-private living-details file for the display toggle')
    args=parser.parse_args()
    previous=json.loads(args.previous.read_text()) if args.previous.exists() else {}
    ex=Extractor()
    hashes=[]
    with tempfile.TemporaryDirectory(prefix='family-report-') as tmp:
        for report in REPORTS:
            path=args.source_dir/report[1]
            output=Path(tmp)/(report[0]+'.txt')
            subprocess.run(['pdftotext','-layout',str(path),str(output)],check=True)
            ex.parse(output.read_text(),report)
            hashes.append(dict(reportId=report[0],sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    ex.resolve()
    archive,tree,audit=ex.output(previous)
    checks=json.loads(args.checks.read_text()) if args.checks.exists() else None
    result=validate(archive,tree,checks)
    for report in audit['reports']:
        if report['numberedCandidates']!=report['numberedEntries'] or report['childCandidates']!=report['childEntries']:
            result['errors'].append('Incomplete entry coverage: '+report['reportId'])
    if any(issue['type'].startswith(('unparsed','unresolved-family','child-without','reference-name','self-link')) for issue in ex.issues):
        result['errors'].append('Unresolved extraction structure')
    result['passed']=not result['errors']
    audit.update(validation=result,sourceHashes=hashes)
    archive['validation']={k:v for k,v in result.items() if k not in {'checks','errors','warnings'}}
    archive['validation']['reviewItems']=len(ex.issues)+len(audit['conflictingClaims'])+len(result['warnings'])+audit['retainedLegacyProfiles']
    archive['validation']['identityReviewCount']=sum(p.get('identityReview',False) for p in archive['profiles'])
    for p in archive['profiles']:
        flags={w['type'] for w in result['warnings'] if p['id'] in [w.get('profileId'),w.get('parentId'),w.get('childId')]}
        labels={'multiple-report-generations':'The reports assign more than one generation; cited connections remain available.',
                'parent-age-review':'Reported birth years imply an unusual parent age. Check the original evidence.',
                'death-before-birth':'Reported birth and death years conflict. Check the original evidence.'}
        p['reviewNotes']=[labels[k] for k in sorted(flags)]
    snapshot=hashlib.sha256(json.dumps([archive,tree],sort_keys=True).encode()).hexdigest()
    archive['snapshotId']=tree['snapshotId']=audit['snapshotId']=snapshot
    archive['livingDetailsAvailable']=args.include_private_details
    args.output_dir.mkdir(parents=True,exist_ok=True)
    # Failed candidates go to an explicit staging folder; never replace a live archive.
    if not result['passed'] and args.output_dir.resolve()==ROOT.resolve():
        raise SystemExit('Validation failed. Rebuild into a staging directory and inspect the audit.')
    for filename,data in [('archive-data.json',archive),('archive-tree.json',tree),('extraction-audit.json',audit)]:
        (args.output_dir/filename).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    if args.include_private_details:
        (args.output_dir/'archive-private-details.json').write_text(json.dumps(dict(snapshotId=snapshot,profiles=ex.private_details),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(**result,issues=len(ex.issues),conflictingClaims=len(audit['conflictingClaims']),retainedLegacy=audit['retainedLegacyProfiles'])))


if __name__=='__main__':
    main()

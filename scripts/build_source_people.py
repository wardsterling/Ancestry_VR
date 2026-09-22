#!/usr/bin/env python3
"""Map printed names to existing page-cited profiles; never infer photo identities."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import unicodedata

import fitz


def tokens(text):
    text = ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c))
    # PDF generation markers / footnotes are numeric superscripts inside names.
    return re.findall(r'[^\W\d_]+', text.casefold())


def page_highlights(page, people):
    stream = []
    for word in page.get_text('words', sort=True):
        for token in tokens(word[4]):
            stream.append((token, fitz.Rect(word[:4]), (word[5], word[6])))
    phrases = defaultdict(set)
    for person in people:
        for name in [person['name'], *person.get('aliases', [])]:
            phrase = tuple(tokens(name))
            if phrase and phrase not in {('unknown',), ('unnamed',)}:
                phrases[phrase].add(person['id'])
    first = defaultdict(list)
    for phrase, ids in phrases.items():
        first[phrase[0]].append((phrase, ids))
    found = defaultdict(set)
    for i, (token, _, _) in enumerate(stream):
        for phrase, ids in first[token]:
            match = stream[i:i + len(phrase)]
            if tuple(w[0] for w in match) != phrase:
                continue
            # Avoid joining separate columns or far-apart text blocks into a name.
            if any(abs(a[1].y0-b[1].y0) > max(a[1].height,b[1].height)*2.5 for a,b in zip(match,match[1:])):
                continue
            lines = {}
            for _, rect, line in match:
                lines[line] = lines[line] | rect if line in lines else fitz.Rect(rect)
            for rect in lines.values():
                rect = rect & page.rect
                if rect.is_empty:
                    continue
                box = tuple(round(n,4) for n in (rect.x0/page.rect.width*100,rect.y0/page.rect.height*100,rect.width/page.rect.width*100,rect.height/page.rect.height*100))
                found[box].update(ids)
    return [{'rect':list(rect),'profileIds':sorted(ids)} for rect,ids in sorted(found.items(),key=lambda item:(item[0][1],item[0][0]))]


def build(root):
    archive=json.loads((root/'archive-data.json').read_text())
    if not archive.get('snapshotId') or not archive.get('validation',{}).get('passed'):
        raise ValueError('A validated archive snapshot is required.')
    cited=defaultdict(dict)
    for person in archive['profiles']:
        for citation in person.get('sources',[]):
            cited[(citation['reportId'],citation['page'])][person['id']]=person
    index={'version':1,'snapshotId':archive['snapshotId'],'sourceHashes':{},'pages':{}}
    for doc in archive.get('documents',[]):
        original=root/doc['url']
        if hashlib.sha256(original.read_bytes()).hexdigest()!=doc['sha256']:
            raise ValueError('Original PDF hash mismatch: '+doc['id'])
        index['sourceHashes'][doc['id']]=doc['sha256']
        pages={}
        with fitz.open(original) as pdf:
            if len(pdf)!=doc['pages']:
                raise ValueError('Source page count mismatch: '+doc['id'])
            for i,page in enumerate(pdf):
                pages[str(i+1)]=page_highlights(page,list(cited[(doc['id'],i+1)].values()))
        index['pages'][doc['id']]=pages
        print(f"{doc['id']}: {sum(len(items) for items in pages.values())} selectable written-name locations")
    (root/'source-people.json').write_text(json.dumps(index,separators=(',',':'))+'\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path('.'))
    build(parser.parse_args().root)

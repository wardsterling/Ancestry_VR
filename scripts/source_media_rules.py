"""Shared caption-to-portrait association; geometry is supplied by the PDF reader."""
import re
from extract_reports import head_name, name_key, name_pattern, vitals

def adjacent_entry(rect,lines,profiles,report_id=None,page_number=None,private=None):
    candidates=[]
    for i,line in enumerate(lines):
        x0,y0,x1,y1=line['bbox']
        if not (-3<=x0-rect.x1<=65 and -18<=y0-rect.y0<=6):
            continue
        tail=[line['text']]
        for other in lines[i+1:i+7]:
            if other['bbox'][1]-y1>65:
                break
            if abs(other['bbox'][0]-x0)<20:
                tail.append(other['text'])
        text=' '.join(tail)
        text=re.sub(r'^\s*(?:\d{1,3}\.\s*)?(?:[ivx]+\.\s*)?','',text,flags=re.I)
        name=head_name(text)
        hits=[p for p in profiles if name and name_key(name) in {name_key(n) for n in [p['name']]+p.get('aliases',[])}]
        if not hits:
            clean=re.sub(r'(?<=[A-Za-z])\d[\d,]*','',text)
            prefix=[(len(n),p) for p in profiles for n in [p['name']]+p.get('aliases',[]) if re.match(name_pattern(n)+r'(?=\s|\(|$)',clean,re.I)]
            if prefix:
                longest=max(n for n,p in prefix)
                hits=[p for n,p in prefix if n==longest]
        # Distinguish same-named siblings by the printed record/child marker.
        markers=[other['text'].strip() for other in lines if abs(other['bbox'][1]-y0)<4 and other['bbox'][2]<=rect.x0+3]
        marker=re.search(r'(?:(\d+)\.\s*)?([ivx]+)\.$',' '.join(markers),re.I)
        number=re.search(r'^(\d+)\.\s*',line['text']) or re.search(r'^(\d+)\.$',' '.join(markers))
        if len(hits)>1 and (marker or number):
            precise=[p for p in hits if any(s['reportId']==report_id and s['page']==page_number and
                ((marker and s.get('childOrdinal','').lower()==marker[2].lower()) or (number and s.get('recordNumber')==int(number[1]))) for s in p['sources'])]
            if precise:
                hits=precise
        if len(hits)>1:
            birth=vitals(text).get('birthYear')
            dated=[p for p in hits if birth and (p.get('birthYear') or (private or {}).get(p['id'],{}).get('birthYear'))==birth]
            if dated:
                hits=dated
        hits={p['id'] for p in hits}
        if len(hits)==1:
            candidates.append((abs(y0-rect.y0)+max(0,x0-rect.x1)*.15,next(iter(hits)),line['text']))
    candidates.sort()
    if not candidates or (len(candidates)>1 and candidates[1][0]-candidates[0][0]<3 and candidates[1][1]!=candidates[0][1]):
        return None
    return candidates[0][1:]


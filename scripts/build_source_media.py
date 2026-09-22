#!/usr/bin/env python3
"""Attach PDF images by adjacent named entry and cited page, never by face matching."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import shutil

import fitz
from extract_reports import REPORTS, head_name, name_key, name_pattern, vitals


def image_regions(images):
    """Some PDF producers store one photograph as adjoining horizontal strips."""
    regions=[]
    for item in sorted(images,key=lambda i:(round(i['bbox'][0],1),i['bbox'][1])):
        rect=fitz.Rect(item['bbox'])
        if rect.is_empty:
            continue
        group=next((r for r in regions if abs(r.x0-rect.x0)<1 and abs(r.x1-rect.x1)<1 and rect.y0-r.y1<1 and rect.y0>=r.y0),None)
        if group is not None:
            group.include_rect(rect)
        else:
            regions.append(rect)
    return [r for r in regions if r.width>=28 and r.height>=28 and .3<r.width/r.height<3]


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


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-dir',type=Path,required=True)
    parser.add_argument('--archive-dir',type=Path,required=True)
    args=parser.parse_args()
    directory=args.archive_dir
    archive=json.loads((directory/'archive-data.json').read_text())
    tree=json.loads((directory/'archive-tree.json').read_text())
    private=json.loads((directory/'archive-private-details.json').read_text())
    audit=json.loads((directory/'extraction-audit.json').read_text())
    assert archive['snapshotId']==tree['snapshotId']==private['snapshotId']
    by_page=defaultdict(dict)
    by_report=defaultdict(dict)
    for p in archive['profiles']:
        for s in p['sources']:
            by_page[s['reportId'],s['page']][p['id']]=p
            by_report[s['reportId']][p['id']]=p
    portraits=defaultdict(list)
    review=[]
    total=0
    (directory/'assets/report-portraits').mkdir(parents=True,exist_ok=True)
    (directory/'source-documents').mkdir(exist_ok=True)
    documents=[]
    for report_id,filename,title in REPORTS:
        original=args.source_dir/filename
        doc=fitz.open(original)
        source_url='source-documents/'+report_id+'.pdf'
        shutil.copy2(original,directory/source_url)
        digest=hashlib.sha256(original.read_bytes()).hexdigest()
        documents.append(dict(id=report_id,title=title,url=source_url,pages=len(doc),sha256=digest))
        for page_index,page in enumerate(doc):
            regions=image_regions(page.get_image_info())
            if not regions:
                continue
            lines=[]
            for b in page.get_text('dict',flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']:
                if b['type']==0:
                    for line in b['lines']:
                        lines.append(dict(bbox=line['bbox'],text=''.join(s['text'] for s in line['spans'])))
            lines.sort(key=lambda l:(round(l['bbox'][1],1),l['bbox'][0]))
            for rect in regions:
                total+=1
                match=adjacent_entry(rect,lines,list(by_page[report_id,page_index+1].values()),report_id,page_index+1,private['profiles'])
                if not match:
                    # Continued partner biographies can have their entry citation on
                    # the preceding page. Require a unique report identity here too.
                    match=adjacent_entry(rect,lines,list(by_report[report_id].values()),report_id,page_index+1,private['profiles'])
                evidence=dict(reportId=report_id,page=page_index+1,bbox=[round(v,2) for v in rect])
                if not match:
                    review.append(evidence)
                    continue
                pid,anchor=match
                data=page.get_pixmap(matrix=fitz.Matrix(2,2),clip=rect,alpha=False).tobytes('jpeg',jpg_quality=90)
                image_hash=hashlib.sha256(data).hexdigest()[:24]
                src='assets/report-portraits/'+image_hash+'.jpg'
                (directory/src).write_bytes(data)
                portraits[pid].append(dict(src=src,source={**evidence,'anchor':anchor},area=rect.width*rect.height))
        doc.close()
    for p in archive['profiles']:
        choices=sorted(portraits[p['id']],key=lambda v:-v['area'])
        if choices:
            chosen={k:v for k,v in choices[0].items() if k!='area'}
            if p['restricted']:
                private['profiles'].setdefault(p['id'],{})['portrait']=chosen
            else:
                p['portrait']=chosen
    archive['documents']=documents
    archive['mediaSummary']=dict(profilesWithPortraits=sum(bool(v) for v in portraits.values()),sourceImages=total,unassignedImages=len(review))
    audit['media']=dict(**archive['mediaSummary'],unassigned=review,assignments={pid:v for pid,v in portraits.items() if v})
    # Tie all display variants and the tree to this same immutable snapshot.
    snapshot=hashlib.sha256(json.dumps([archive,tree,private],sort_keys=True).encode()).hexdigest()
    for obj in [archive,tree,private,audit]:
        obj['snapshotId']=snapshot
    for file,obj in [('archive-data.json',archive),('archive-tree.json',tree),('archive-private-details.json',private),('extraction-audit.json',audit)]:
        (directory/file).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(archive['mediaSummary']))


if __name__=='__main__':
    main()

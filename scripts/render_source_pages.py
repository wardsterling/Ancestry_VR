#!/usr/bin/env python3
"""Render immutable source PDFs into page previews; never change originals."""
import hashlib,json
from pathlib import Path
import fitz

def render(root):
    archive=json.loads((root/'archive-data.json').read_text())
    for doc in archive.get('documents',[]):
        original=root/doc['url']
        if hashlib.sha256(original.read_bytes()).hexdigest()!=doc['sha256']:
            raise ValueError('Original PDF hash mismatch: '+doc['id'])
        pdf=fitz.open(original);out=root/'source-pages'/doc['id'];out.mkdir(parents=True,exist_ok=True)
        for i,page in enumerate(pdf):
            page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False).save(out/f'{i+1}.jpg',jpg_quality=82)
            # Preserve text for accessible reading without opening a PDF viewer.
            (out/f'{i+1}.txt').write_text(page.get_text(),encoding='utf8')
        doc['pageImages']='source-pages/'+doc['id']
        doc['pageRatios']=[round(page.rect.width/page.rect.height,6) for page in pdf]
        print(f"{doc['id']}: {len(pdf)} pages",flush=True)
    (root/'archive-data.json').write_text(json.dumps(archive,ensure_ascii=False,separators=(',',':'))+'\n')
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path('.'));args=parser.parse_args();render(args.root)

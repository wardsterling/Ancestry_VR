"""Synthetic written-name coordinates only; no family records in fixtures."""
import importlib.util
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
AVAILABLE=importlib.util.find_spec('fitz') is not None
if AVAILABLE:
    import fitz
    from build_source_people import page_highlights


@unittest.skipUnless(AVAILABLE,'Install PyMuPDF to test source name highlights')
class SourcePeopleTests(unittest.TestCase):
    def test_name_boundaries_and_ambiguous_profiles(self):
        pdf=fitz.open();page=pdf.new_page()
        page.insert_text((60,60),'Joanne Example; Ann Example; ANN2 EXAMPLE')
        people=[{'id':'a','name':'Ann Example'},{'id':'b','name':'Ann Example'}]
        regions=page_highlights(page,people)
        self.assertEqual(len(regions),2)
        for region in regions:
            self.assertEqual(region['profileIds'],['a','b'])
            x,y,w,h=region['rect']
            self.assertTrue(0<=x<x+w<=100)
            self.assertTrue(0<=y<y+h<=100)

    def test_wrapped_name_has_separate_click_targets(self):
        pdf=fitz.open();page=pdf.new_page()
        page.insert_text((60,60),'Alex\nExample',fontsize=12)
        regions=page_highlights(page,[{'id':'a','name':'Alex Example'}])
        self.assertEqual(len(regions),2)
        self.assertTrue(all(r['profileIds']==['a'] for r in regions))

    def test_non_cited_names_never_gain_targets(self):
        pdf=fitz.open();page=pdf.new_page();page.insert_text((60,60),'Alex Example')
        self.assertEqual(page_highlights(page,[{'id':'b','name':'Morgan Sample'}]),[])

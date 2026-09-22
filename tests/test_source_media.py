"""Synthetic layout checks; PyMuPDF is required only for media extraction."""
import importlib.util
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
AVAILABLE=importlib.util.find_spec('fitz') is not None
if AVAILABLE:
    import fitz
    from build_source_media import image_regions, adjacent_entry


@unittest.skipUnless(AVAILABLE,'Install PyMuPDF to test source-image extraction')
class SourceMediaTests(unittest.TestCase):
    def test_image_strips_join_without_merging_neighboring_portraits(self):
        strips=[{'bbox':(0,i*4,60,i*4+4)} for i in range(10)]+[{'bbox':(80,0,140,60)}]
        boxes=image_regions(strips)
        self.assertEqual(len(boxes),2)
        self.assertEqual(tuple(boxes[0]),(0,0,60,40))

    def test_portrait_uses_entry_at_top_not_later_spouse(self):
        lines=[{'bbox':(125,98,300,110),'text':'Alex Example was born in 1800.'},
               {'bbox':(125,112,300,125),'text':'Morgan Sample was born in 1801.'}]
        profiles=[{'id':'a','name':'Alex Example'},{'id':'b','name':'Morgan Sample'}]
        self.assertEqual(adjacent_entry(fitz.Rect(50,100,120,160),lines,profiles)[0],'a')

    def test_same_named_children_require_printed_markers(self):
        lines=[{'bbox':(10,98,25,110),'text':'ii.'},{'bbox':(125,98,300,110),'text':'Sam Example was born in 1830.'}]
        people=[{'id':str(i),'name':'Sam Example','sources':[{'reportId':'r','page':1,'childOrdinal':ordinal}]} for i,ordinal in enumerate(['i','ii'])]
        self.assertEqual(adjacent_entry(fitz.Rect(50,100,120,160),lines,people,'r',1)[0],'1')
        self.assertIsNone(adjacent_entry(fitz.Rect(50,100,120,160),lines[1:],people,'r',1))

import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from runtime_extract import rebuild

TEXT='''First Generation\n\n1. Alex Example was born on 2 Jan 1800 in Sample Town. He died in 1880.\nHe married Jamie Test.\nAlex Example and Jamie Test had the following children:\n\n2 i. Casey Example was born in 1830.\n\nSecond Generation\n\n2. Casey Example (son of Alex Example and Jamie Test) was born in 1830.\n'''
class RuntimeExtractTests(unittest.TestCase):
    def payload(self,text=TEXT):
        added={'id':'new-report','title':'Synthetic family report','importItemId':'item-test','sha256':'a'*64,'pages':1,'url':'/api/archive-items/item-test/file?inline=1','pageAssets':[{'image':'/example.jpg','text':'/example.txt'}]}
        return {'archive':{'profiles':[],'documents':[]},'added':added,'inputs':{'new-report':{'text':text}},'geometry':[{'page':1,'width':600,'height':800,'lines':[],'regions':[]}], 'sourcePeople':{'version':1,'pages':{},'sourceHashes':{}},'privateDetails':{'profiles':{}}}
    def test_shared_parser_preserves_explicit_family_and_living_projection(self):
        result=rebuild(self.payload())
        self.assertNotIn('error',result)
        self.assertEqual(result['imported']['people'],3)
        people={p['name']:p for p in result['archive']['profiles']}
        child=people['Casey Example']['id']
        parents={e['parentId'] for e in result['tree']['edges'] if e['childId']==child and e['kind']=='reported-parent'}
        self.assertEqual(parents,{people['Alex Example']['id'],people['Jamie Test']['id']})
        self.assertTrue(people['Jamie Test']['restricted'])
        self.assertIn(people['Jamie Test']['id'],result['privateDetails']['profiles'])
        self.assertEqual(result['archive']['snapshotId'],result['sourcePeople']['snapshotId'])
    def test_unsupported_or_incomplete_source_does_not_replace_archive(self):
        for text in ['A scan with no recognized entries.',TEXT.replace('Alex Example and Jamie Test had the following children:', 'Unclear family:')]:
            payload=self.payload(text);result=rebuild(payload);self.assertIn('error',result);self.assertEqual(payload['archive']['profiles'],[])
    def test_same_original_is_not_reimported(self):
        payload=self.payload();payload['archive']['documents']=[payload['added']]
        with self.assertRaisesRegex(ValueError,'already incorporated'):rebuild(payload)

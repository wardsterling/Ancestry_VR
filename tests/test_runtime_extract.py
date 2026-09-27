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
    def test_incomplete_entry_identifies_report_page_and_coverage(self):
        payload=self.payload(TEXT.replace('2 i. Casey Example was born in 1830.',
                                         '\fii. Unknown was born in 1830.'))
        result=rebuild(payload)
        self.assertIn('"Synthetic family report"',result['error'])
        self.assertIn('0 of 1 child entries read',result['error'])
        self.assertIn('page 2: child name could not be read',result['error'])
        self.assertIn('original PDF remains saved',result['error'])
        self.assertEqual(payload['archive']['profiles'],[])
        self.assertNotIn('archive',result)
    def test_true_reference_mismatch_still_blocks_import(self):
        result=rebuild(self.payload(TEXT.replace('2 i. Casey Example', '2 i. Robin Example')))
        self.assertIn('page 1: numbered reference has a different name',result['error'])
        self.assertNotIn('archive',result)
    def test_split_identity_keeps_printed_name_links_and_source_specific_portrait(self):
        payload=self.payload()
        portrait={'src':'assets/synthetic.jpg','source':{'reportId':'old-report','page':2}}
        payload['archive']={'documents':[{'id':'old-report','title':'Earlier report','sha256':'b'*64,'pages':2}],
                            'profiles':[{'id':'old-person','name':'Casey Sample','portrait':portrait}],
                            'idAliases':{'old-bookmark':{'name':'Casey Sample','targets':['old-person']}}}
        payload['inputs']['old-report']={'text':'First Generation\n1. Casey Sample was born in 1800.\f2. Casey Sample was born in 1850.'}
        mark={'rect':[10,10,20,5],'profileIds':['old-person']}
        payload['sourcePeople']={'version':1,'sourceHashes':{'old-report':'b'*64},'pages':{'old-report':{'1':[mark],'2':[mark]}}}
        result=rebuild(payload);self.assertNotIn('error',result)
        people={p['birthYear']:p for p in result['archive']['profiles'] if p['name']=='Casey Sample'}
        self.assertEqual(set(result['archive']['idAliases']['old-bookmark']['targets']),{p['id'] for p in people.values()})
        for page,year in [(1,1800),(2,1850)]:
            self.assertEqual(result['sourcePeople']['pages']['old-report'][str(page)][0]['profileIds'],[people[year]['id']])
        self.assertNotIn('portrait',people[1800])
        self.assertEqual(people[1850]['portrait'],portrait)

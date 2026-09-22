"""Synthetic report fixtures only. Run with the Python standard library."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from extract_reports import Extractor, head_name, parent_names, vitals, validate, attributed_vitals

REPORT = ('demo', 'demo.pdf', 'Synthetic report')
REPORT_TEXT = '''Generation 1
1. ALEX1 EXAMPLE was born on 01 Jan 1800 in Demo Town.
He married MORGAN SAMPLE. She was born on 02 Feb 1801 in Elsewhere.
Alex Example and Morgan Sample had the following
children:
2. i. JAMIE2 EXAMPLE (son of Alex Example and Morgan Sample) was born on
03 Mar 1825 in Demo Town. He married TAYLOR TEST.
ii. CASEY EXAMPLE (daughter of Other Person and Morgan Sample) was born in 1827.
\fGeneration 2
2. JAMIE2 EXAMPLE (Alex1 Example) was
born on 03 Mar 1825 in Demo Town. He married TAYLOR TEST.
Jamie Example and Taylor Test had the following child:
i. ROBIN EXAMPLE (step son of Jamie Example and biological son of Taylor Test)
was born on 04 Apr 1850 in Demo Town.
'''


def build(text=REPORT_TEXT, previous=None):
    ex = Extractor()
    ex.parse(text, REPORT)
    ex.resolve()
    return ex.output(previous or {})


class ExtractionTests(unittest.TestCase):
    def test_wrapped_headings_numbered_references_and_page_citations(self):
        archive, tree, audit = build()
        self.assertFalse(audit['issues'])
        jamie = [p for p in archive['profiles'] if p['name'] == 'Jamie Example']
        self.assertEqual(len(jamie), 1)
        self.assertEqual({s['page'] for s in jamie[0]['sources']}, {1, 2})
        edge = next(e for e in tree['edges'] if e['parentId'] == 'jamieexample' and e['childId'] == 'robinexample')
        self.assertEqual(edge['kind'], 'step-parent')
        self.assertEqual({s['page'] for s in edge['evidence']}, {2})
        self.assertTrue(validate(archive, tree)['passed'])

    def test_family_lists_do_not_override_explicit_parentage(self):
        _, tree, _ = build()
        edges = {e['parentId']: e for e in tree['edges'] if e['childId'] == 'caseyexample'}
        self.assertEqual(edges['alexexample']['kind'], 'family-group')
        self.assertEqual(edges['otherperson']['kind'], 'reported-parent')
        self.assertEqual(edges['morgansample']['kind'], 'reported-parent')

    def test_referenced_person_partner_is_one_identity(self):
        archive, _, _ = build()
        self.assertEqual(len([p for p in archive['profiles'] if p['name'] == 'Taylor Test']), 1)
        taylor = next(p for p in archive['profiles'] if p['name'] == 'Taylor Test')
        self.assertIsNone(taylor['birthDate'])  # Never borrow the child's birth.

    def test_root_and_child_with_same_name_never_become_self_parent(self):
        archive, tree, _ = build('''Generation 1
1. SAM EXAMPLE was born on 01 Jan 1800.
Sam Example had the following child:
i. SAM EXAMPLE (son of Sam Example) was born on 02 Feb 1830.
''')
        self.assertEqual(len([p for p in archive['profiles'] if p['name'] == 'Sam Example']), 2)
        self.assertTrue(validate(archive, tree)['passed'])
        self.assertEqual(len(tree['edges']), 1)

    def test_same_name_alone_is_not_cross_report_identity_evidence(self):
        ex = Extractor()
        for report in [REPORT, ('other', 'other.pdf', 'Other synthetic report')]:
            ex.parse('Generation 1\n1. ALEX EXAMPLE was born about 1800.', report)
        ex.resolve()
        archive, _, _ = ex.output({})
        self.assertEqual(len(archive['profiles']), 2)

    def test_corroborated_full_birth_date_merges_across_reports(self):
        ex = Extractor()
        for report in [REPORT, ('other', 'other.pdf', 'Other synthetic report')]:
            ex.parse('Generation 1\n1. ALEX EXAMPLE was born on 01 Jan 1800.', report)
        ex.resolve()
        archive, _, _ = ex.output({})
        self.assertEqual(len(archive['profiles']), 1)
        self.assertEqual(len(archive['profiles'][0]['sources']), 2)

    def test_matching_resolved_parents_and_ordinal_merge_undated_child_and_partner(self):
        text='''Generation 1
1. ALEX EXAMPLE was born on 01 Jan 1800.
He married MORGAN SAMPLE. She was born on 02 Feb 1801.
Alex Example and Morgan Sample had the following child:
i. CASEY EXAMPLE (son of Alex Example and Morgan Sample). He married TAYLOR TEST.
'''
        ex=Extractor()
        for report in [REPORT,('other','other.pdf','Other synthetic report')]:
            ex.parse(text,report)
        previous,_,_=ex.output({})
        ex.resolve();archive,tree,audit=ex.output(previous)
        for name in ['Casey Example','Taylor Test']:
            self.assertEqual(len([p for p in archive['profiles'] if p['name']==name]),1)
        self.assertTrue(audit['duplicateMerges'])
        self.assertTrue(validate(archive,tree)['passed'])
        casey=next(p for p in archive['profiles'] if p['name']=='Casey Example')
        for old in [p for p in previous['profiles'] if p['name']=='Casey Example']:
            self.assertEqual(archive['idAliases'][old['id']]['targets'],[casey['id']])

    def test_different_ordinals_conflicting_dates_and_family_only_links_do_not_merge(self):
        base='''Generation 1
1. ALEX EXAMPLE was born on 01 Jan 1800.
He married MORGAN SAMPLE. She was born on 02 Feb 1801.
Alex Example and Morgan Sample had the following child:
i. CASEY EXAMPLE (son of Alex Example and Morgan Sample) was born in 1825.
'''
        undated=base.replace(' was born in 1825','')
        cases=[(undated,undated.replace('i. CASEY','ii. CASEY')),
               (base,base.replace('1825','1826')),
               (base.replace(' (son of Alex Example and Morgan Sample)',''),base.replace(' (son of Alex Example and Morgan Sample)',''))]
        for first,second in cases:
            ex=Extractor();ex.parse(first,REPORT);ex.parse(second,('other','other.pdf','Other synthetic report'));ex.resolve()
            archive,_,_=ex.output({})
            self.assertEqual(len([p for p in archive['profiles'] if p['name']=='Casey Example']),2)

    def test_no_spouse_or_child_vitals_attached_to_subject(self):
        archive, _, _ = build()
        p = next(p for p in archive['profiles'] if p['name'] == 'Alex Example')
        self.assertEqual(p['birthYear'], 1800)
        self.assertEqual(p['birthPlace'], 'Demo Town')
        self.assertIsNone(p['deathYear'])
        self.assertEqual(vitals('Alex Example. He married Morgan Sample. She was born in 1801.'), {})
        self.assertEqual(parent_names('Alex Example was born in 1800. He married Morgan Sample (daughter of Someone Else).'), [])

    def test_later_parent_clause_does_not_swallow_name(self):
        self.assertEqual(head_name('Casey (Jay) Example was born in 1825. Morgan Sample (daughter of Other Person) was born in 1801.'), 'Casey (Jay) Example')
        self.assertEqual(head_name('JAMIE EXAMPLE (Alex1 Example). He married Taylor Test.'), 'Jamie Example')
        self.assertEqual(attributed_vitals('Alex Example','Alex Example\nMorgan Sample was born in 1800.'), {})

    def test_location_abbreviation_is_not_a_child_ordinal(self):
        archive, tree, audit = build('''Generation 1
1. ALEX EXAMPLE was born in 1800.
Alex Example had the following child:
i. JAMIE EXAMPLE was born in 1825 in Washington,
DC. MORGAN SAMPLE was born in 1801.
''')
        self.assertFalse(audit['issues'])
        self.assertEqual(len(tree['edges']), 1)
        self.assertNotIn('morgansample', {e['childId'] for e in tree['edges']})

    def test_approximate_dates_and_reference_markers(self):
        facts = vitals('Alex Example was born about 1800 in Demo Town.12 He died in 1870 in Elsewhere29,32.')
        self.assertEqual(facts['birthKey'], '~1800')
        self.assertEqual(facts['deathPlace'], 'Elsewhere')

    def test_legacy_merged_links_disambiguate_and_survive_rebuild(self):
        previous = {'profiles': [{'id': 'old', 'name': 'Alex Example', 'aliases': []}]}
        ex = Extractor()
        ex.parse('Generation 1\n1. ALEX EXAMPLE was born in 1800.\n2. ALEX EXAMPLE was born in 1850.', REPORT)
        ex.resolve()
        archive, _, _ = ex.output(previous)
        self.assertEqual(len(archive['idAliases']['old']['targets']), 2)
        again, _, _ = ex.output(archive)
        self.assertEqual(archive['idAliases']['old'], again['idAliases']['old'])
        self.assertEqual(archive['sourceIdMap'], again['sourceIdMap'])

    def test_restricted_profiles_keep_cited_links_but_no_vitals(self):
        archive, tree, _ = build(REPORT_TEXT.replace('1850', '2020'))
        robin = next(p for p in archive['profiles'] if p['name'] == 'Robin Example')
        self.assertTrue(robin['restricted'])
        self.assertIsNone(robin['birthYear'])
        self.assertFalse(robin['facts'])
        self.assertTrue(any(e['childId'] == robin['id'] for e in tree['edges']))

    def test_structural_and_private_family_gates_fail_closed(self):
        archive, tree, _ = build()
        checks = {'checks': [{'label': 'wrong expected family', 'subject': 'Jamie Example', 'direction': 'children', 'expected': ['Unrelated Example']}]}
        self.assertFalse(validate(archive, tree, checks)['passed'])
        broken = {**tree, 'edges': [{**tree['edges'][0], 'parentId': 'missing'}]}
        self.assertFalse(validate(archive, broken)['passed'])
        uncited = {**tree, 'edges': [{**tree['edges'][0], 'evidence': []}]}
        self.assertFalse(validate(archive, uncited)['passed'])

    def test_cycles_spanning_reports_are_rejected(self):
        archive, tree, _ = build()
        edge = next(e for e in tree['edges'] if e['parentId'] == 'alexexample' and e['childId'] == 'jamieexample')
        cycle = {**edge, 'reportId': 'other', 'parentId': edge['childId'], 'childId': edge['parentId']}
        self.assertFalse(validate(archive, {**tree, 'edges': tree['edges']+[cycle]})['passed'])

    def test_standalone_biography_is_retained_without_inventing_a_spouse(self):
        archive,tree,_=build('''Generation 1
1. ALEX EXAMPLE was born in 1800.

MORGAN SAMPLE died in 1880 in Example Town.
''')
        self.assertIn('morgansample',{p['id'] for p in archive['profiles']})
        self.assertFalse(tree['edges'])

    def test_wrapped_location_and_pronouns_are_not_new_people(self):
        archive,_,_=build('''Generation 1
1. ALEX EXAMPLE was born in 1800 in Washington,
DC. He died in 1880.

Norway. Jamie Sample was born in 1801.
''')
        self.assertEqual([p['name'] for p in archive['profiles']],['Alex Example'])


if __name__ == '__main__':
    unittest.main()

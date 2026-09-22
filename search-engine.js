/* Data-independent search. No network, analytics, storage, or family records. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FamilySearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  const states = {al:'alabama',ak:'alaska',az:'arizona',ar:'arkansas',ca:'california',
    co:'colorado',ct:'connecticut',de:'delaware',dc:'district of columbia',fl:'florida',
    ga:'georgia',hi:'hawaii',id:'idaho',il:'illinois',in:'indiana',ia:'iowa',ks:'kansas',
    ky:'kentucky',la:'louisiana',me:'maine',md:'maryland',ma:'massachusetts',mi:'michigan',
    mn:'minnesota',ms:'mississippi',mo:'missouri',mt:'montana',ne:'nebraska',nv:'nevada',
    nh:'new hampshire',nj:'new jersey',nm:'new mexico',ny:'new york',nc:'north carolina',
    nd:'north dakota',oh:'ohio',ok:'oklahoma',or:'oregon',pa:'pennsylvania',ri:'rhode island',
    sc:'south carolina',sd:'south dakota',tn:'tennessee',tx:'texas',ut:'utah',vt:'vermont',
    va:'virginia',wa:'washington',wv:'west virginia',wi:'wisconsin',wy:'wyoming'};
  const normalizePlace = value => normalize(value).split(' ').map(t => states[t] || t).join(' ');
  const words = value => normalize(value).split(' ').filter(Boolean);

  // One insertion, deletion, substitution, or adjacent transposition. Never fuzz dates.
  function near(a, b) {
    if (a.length < 4 || b.length < 4 || /\d/.test(a + b) || Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
      const diffs = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i);
      return diffs.length <= 1 || (diffs.length === 2 && diffs[1] === diffs[0] + 1 &&
        a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]);
    }
    const [short, long] = a.length < b.length ? [a, b] : [b, a];
    let i = 0, j = 0, skipped = 0;
    while (i < short.length && j < long.length) {
      if (short[i] === long[j]) { i++; j++; } else { j++; skipped++; }
      if (skipped > 1) return false;
    }
    return true;
  }

  function parseQuery(raw) {
    let text = String(raw || '').slice(0, 240), range = null;
    text = text.replace(/\b(\d{4})\s*[-–]\s*(\d{4})\b/, (_, from, to) => {
      range = {from: Number(from), to: Number(to)}; return ' ';
    });
    const phrases = [];
    text = text.replace(/["“]([^"”]+)["”]/g, (_, phrase) => {phrases.push(normalize(phrase)); return ' ';});
    return {terms: words(text).slice(0, 30), phrases: phrases.filter(Boolean), range};
  }

  function makeField(value, kind, weight) {
    const text = kind === 'place' ? normalizePlace(value) : normalize(value);
    return {text, tokens: text.split(' ').filter(Boolean), kind, weight};
  }
  function matchFields(fields, query, fuzzy = true, placeOnly = false) {
    if (query.phrases.some(phrase => !fields.some(f => (' '+f.text+' ').includes(' '+(f.kind === 'place' ? normalizePlace(phrase) : phrase)+' ')))) return null;
    let score = query.phrases.length * 60, approximate = false;
    const terms = placeOnly ? query.terms.flatMap(t => (states[t] || t).split(' ')) : query.terms;
    for (const term of terms) {
      let best = 0, exact = false;
      for (const f of fields) {
        const tokens = f.kind === 'place' && states[term] ? states[term].split(' ') : [term];
        if (tokens.every(t => f.tokens.includes(t))) {best = Math.max(best, f.weight * 3); exact = true;}
        else if (tokens.every(t => f.tokens.some(w => w.startsWith(t)))) {best = Math.max(best, f.weight * 2); exact = true;}
      }
      if (!best && fuzzy) {
        for (const f of fields) if (f.kind !== 'date' && f.tokens.some(w => near(term, w))) best = Math.max(best, f.weight);
      }
      if (!best) return null;
      score += best; approximate ||= !exact;
    }
    return {score, approximate};
  }

  class Index {
    constructor(profiles = []) {
      this.entries = profiles.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string').map(p => {
        // Ignore stale facets and hidden details even when those exist in an imported record.
        const names = [p.name, ...(p.aliases || [])];
        const places = p.restricted ? [] : (p.places || []);
        const years = p.restricted ? [] : [...new Set([...(p.years || []), p.birthYear, p.deathYear]
          .filter(y => /^\d{4}$/.test(String(y))).map(String))];
        const sources = p.sources || [];
        const fields = [...names.map(n => makeField(n,'name',30)), ...places.map(n => makeField(n,'place',18)),
          ...years.map(n => makeField(n,'date',22)), ...sources.map(s => makeField(s.title,'source',8))];
        return {profile:p, names, places, years, sources, fields};
      });
    }
    search(raw = '', options = {}) {
      const query = parseQuery(raw), from = Number(options.from || 0), to = Number(options.to || 9999);
      if (from > to || (query.range && query.range.from > query.range.to)) return [];
      const out = [];
      for (const e of this.entries) {
        const restricted=e.profile.privacyRestricted??e.profile.restricted;
        if (options.status === 'restricted' && !restricted) continue;
        if (options.status === 'unrestricted' && restricted) continue;
        if (options.source && !e.sources.some(s => s.reportId === options.source)) continue;
        if ((options.from || options.to) && !e.years.some(y => Number(y) >= from && Number(y) <= to)) continue;
        if (query.range && !e.years.some(y => Number(y) >= query.range.from && Number(y) <= query.range.to)) continue;
        if (options.name && !matchFields(e.fields.filter(f=>f.kind==='name'),parseQuery(options.name),options.fuzzy !== false)) continue;
        if (options.place && !matchFields(e.fields.filter(f=>f.kind==='place'),parseQuery(options.place),false,true)) continue;
        const fields = options.scope && options.scope !== 'all' ? e.fields.filter(f=>f.kind===options.scope) : e.fields;
        const match = matchFields(fields, query, options.fuzzy !== false, options.scope === 'place');
        if (!match) continue;
        const whole = normalize(raw);
        if (whole && e.names.some(n=>normalize(n)===whole)) match.score += 300;
        out.push({...match, profile:e.profile});
      }
      return out.sort((a,b)=>a.approximate-b.approximate || b.score-a.score || a.profile.name.localeCompare(b.profile.name));
    }
    facets(options = {}) {
      const ids = new Set(this.search('', options).map(r=>r.profile.id));
      const entries = this.entries.filter(e=>ids.has(e.profile.id));
      return {
        places:[...new Set(entries.flatMap(e=>e.places))].sort(),
        years:[...new Set(entries.flatMap(e=>e.years))].sort(),
        sources:[...new Map(entries.flatMap(e=>e.sources).map(s=>[s.reportId,{id:s.reportId,title:s.title}])).values()]
      };
    }
    suggest(raw, options = {}, limit = 10) {
      if (!normalize(raw)) return [];
      const scope = options.scope || 'all', list = [], query = parseQuery(raw);
      const matches = this.search(raw, {...options, scope:'name'});
      if (scope === 'all' || scope === 'name') list.push(...matches.slice(0,5).map(r=>({kind:'name',id:r.profile.id,value:r.profile.name,approximate:r.approximate,score:r.score})));
      const facets = this.facets(options);
      const pools = [['place',facets.places], ['date',facets.years], ['source',facets.sources]];
      for (const [kind, values] of pools) {
        if (scope !== 'all' && scope !== kind) continue;
        if (query.range && kind !== 'date' && !query.terms.length && !query.phrases.length) continue;
        const found = values.map(v=>({value:typeof v==='string'?v:v.title,id:v.id})).flatMap(item=> {
          if (kind === 'date' && query.range && (Number(item.value)<query.range.from || Number(item.value)>query.range.to)) return [];
          const match = matchFields([makeField(item.value,kind,20)],query,options.fuzzy!==false,kind==='place');
          return match ? [{...item,kind,...match}] : [];
        }).sort((a,b)=>a.approximate-b.approximate || b.score-a.score || a.value.localeCompare(b.value));
        list.push(...found.slice(0,3));
      }
      return list.slice(0,limit);
    }
  }
  return {Index, normalize, normalizePlace, parseQuery, near};
});

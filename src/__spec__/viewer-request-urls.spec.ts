/**
 * The requests `<protvista-uniprot>` makes of its own, outside any track:
 * the Proteins API entry the sequence is read from, and the three URLs it
 * hands the structure panel. Each keeps its EBI default when the config sets
 * nothing, and a config `sources:` key overrides it, `{tokens}` filled like
 * any data URL's.
 *
 * `<protvista-uniprot-structure>` is the global stub here (see
 * `nightingale-mocks.ts`), so what it is handed is read off its attributes;
 * what it then requests is pinned in `structure-urls.spec.ts`.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

import '../protvista-uniprot.js';
import { CSS_PREFIX } from '../styles/css-prefix.js';

const PANEL = `.${CSS_PREFIX}-error-panel`;
const DEFAULT_ENTRY = 'https://www.ebi.ac.uk/proteins/api/proteins/P05067';
const STRUCTURE_ATTRIBUTES = ['uniprot-url', 'alphafold-url', 'beacons-url'];

type El = HTMLElement & {
  viewerConfig?: unknown;
  accession?: string;
  updateComplete: Promise<boolean>;
};

const ok = (json: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => '',
  }) as unknown as Response;

/** Every request answers with a 770-residue entry. */
function stubFetch() {
  const fn = vi.fn(async () => ok({ sequence: { sequence: 'A'.repeat(770) } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** An accession-mode config with one inline track and the given sources. */
const config = (extra: Record<string, unknown> = {}) => ({
  accession: 'P05067',
  rows: [
    {
      id: 'g',
      tracks: [
        {
          id: 'y',
          kind: 'features',
          data: {
            from: 'inline',
            inlineData: [{ type: 'DOMAIN', start: 1, end: 5 }],
          },
        },
      ],
    },
  ],
  ...extra,
});

const appended: El[] = [];
function mountEl(viewerConfig: unknown, dataset: Record<string, string> = {}) {
  const el = document.createElement('protvista-uniprot') as unknown as El;
  Object.assign(el.dataset, dataset);
  el.viewerConfig = viewerConfig;
  document.body.append(el);
  appended.push(el);
  return el;
}

async function ready(el: El) {
  await vi.waitFor(() => {
    if (!el.querySelector('nightingale-manager')) {
      throw new Error('viewer not ready');
    }
  });
  await el.updateComplete;
}

const fetchedUrls = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.map(([url]) => String(url));

afterEach(() => {
  for (const el of appended.splice(0)) el.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the sequence entry', () => {
  it('is the Proteins API entry by default', async () => {
    const fetchFn = stubFetch();
    const el = mountEl(config());
    await ready(el);
    expect(fetchedUrls(fetchFn)).toEqual([DEFAULT_ENTRY]);
  });

  it('is `sources.sequenceEntry` when the config sets it', async () => {
    const fetchFn = stubFetch();
    const el = mountEl(
      config({
        sources: { sequenceEntry: 'https://mirror.example.org/{accession}' },
      })
    );
    await ready(el);
    expect(fetchedUrls(fetchFn)).toEqual(['https://mirror.example.org/P05067']);
  });

  it('fills `variables:` and data-* tokens like a data URL', async () => {
    const fetchFn = stubFetch();
    const el = mountEl(
      config({
        variables: { release: '2026_01' },
        sources: {
          sequenceEntry:
            'https://mirror.example.org/{release}/{species}/{accession}',
        },
      }),
      { species: 'human' }
    );
    await ready(el);
    expect(fetchedUrls(fetchFn)).toEqual([
      'https://mirror.example.org/2026_01/human/P05067',
    ]);
  });

  it('is not requested half-built when a token has no value', async () => {
    const fetchFn = stubFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = mountEl(
      config({
        sources: {
          sequenceEntry: 'https://mirror.example.org/{species}/{accession}',
        },
      })
    );
    await vi.waitFor(() => {
      if (!el.querySelector(PANEL)) throw new Error('no panel yet');
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(el.querySelector(PANEL)?.textContent).toContain(
      "needs a value this page doesn't set"
    );
    const cause = warn.mock.calls
      .flat()
      .find((arg): arg is Error => arg instanceof Error);
    expect(cause?.message).toContain('undefined variable(s) {species}');
  });
});

describe('the structure panel URLs', () => {
  it('are left to the panel’s own defaults when the config sets none', async () => {
    stubFetch();
    const el = mountEl(config());
    await ready(el);
    const structure = el.querySelector('protvista-uniprot-structure');
    expect(structure?.getAttribute('accession')).toBe('P05067');
    for (const name of STRUCTURE_ATTRIBUTES) {
      expect(structure?.hasAttribute(name)).toBe(false);
    }
  });

  it('are passed on from `sources:`, with their tokens filled', async () => {
    stubFetch();
    const el = mountEl(
      config({
        variables: { host: 'mirror.example.org' },
        sources: {
          structureUniprot: 'https://{host}/uniprotkb/{accession}',
          structureAlphafold: 'https://{host}/alphafold/{accession}',
          structureBeacons: 'https://{host}/beacons/{accession}.json',
        },
      })
    );
    await ready(el);
    const structure = el.querySelector('protvista-uniprot-structure');
    expect(structure?.getAttribute('uniprot-url')).toBe(
      'https://mirror.example.org/uniprotkb/P05067'
    );
    expect(structure?.getAttribute('alphafold-url')).toBe(
      'https://mirror.example.org/alphafold/P05067'
    );
    expect(structure?.getAttribute('beacons-url')).toBe(
      'https://mirror.example.org/beacons/P05067.json'
    );
  });

  it('passes a template that does not resolve on as written', async () => {
    stubFetch();
    const el = mountEl(
      config({
        sources: { structureBeacons: 'https://x.example.org/{species}' },
      })
    );
    await ready(el);
    expect(
      el
        .querySelector('protvista-uniprot-structure')
        ?.getAttribute('beacons-url')
    ).toBe('https://x.example.org/{species}');
  });
});

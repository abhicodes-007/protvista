/**
 * The requests the real `<protvista-uniprot-structure>` makes: UniProtKB,
 * AlphaFold DB and 3D-Beacons by accession, or 3D-Beacons by checksum. Each
 * keeps its EBI default unless its attribute (`uniprot-url`,
 * `alphafold-url`, `beacons-url`, `beacons-checksum-url`) names another URL
 * template.
 *
 * `nightingale-mocks.ts` stubs this module for every other spec, so this one
 * unmocks it, as `structure-color-theme.spec.ts` does.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.unmock('../protvista-uniprot-structure');
vi.mock('@nightingale-elements/nightingale-structure', () => ({
  default: class extends HTMLElement {},
  amColorScale: () => '#000000',
}));
vi.mock('../icons/download.svg', () => ({ default: '' }));
vi.mock('../icons/external-link.svg', () => ({ default: '' }));
vi.mock('../icons/spinner.svg', () => ({ default: '' }));

const DEFAULTS = {
  uniprot: 'https://rest.uniprot.org/uniprotkb/P05067',
  alphafold:
    'https://alphafold.ebi.ac.uk/api/prediction/P05067?include_complexes=true',
  beacons:
    'https://www.ebi.ac.uk/pdbe/pdbe-kb/3dbeacons/api/uniprot/summary/P05067.json?exclude_provider=pdbe',
  beaconsChecksum:
    'https://www.ebi.ac.uk/pdbe/pdbe-kb/3dbeacons/api/v2/sequence/summary?id=0123abcd&type=md5',
};

const appended: HTMLElement[] = [];
afterEach(() => {
  appended.splice(0).forEach((el) => el.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Mount with `attributes` and return every URL the element requested. */
async function requested(attributes: Record<string, string>) {
  // Every request 404s, so the element has nothing to process.
  const fetchFn = vi.fn<(url: string) => Promise<Response>>(
    async () => ({ ok: false, status: 404 }) as Response
  );
  vi.stubGlobal('fetch', fetchFn);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await import('../protvista-uniprot-structure');
  const el = document.createElement('protvista-uniprot-structure');
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  document.body.append(el);
  appended.push(el);
  await vi.waitFor(() => {
    if (fetchFn.mock.calls.length === 0) throw new Error('no request yet');
  });
  // Drop the empty URLs fetchAll is handed for the requests a lookup skips.
  return fetchFn.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url !== '');
}

describe('<protvista-uniprot-structure> request URLs', () => {
  it('requests the EBI defaults by accession', async () => {
    expect(await requested({ accession: 'P05067' })).toEqual([
      DEFAULTS.uniprot,
      DEFAULTS.alphafold,
      DEFAULTS.beacons,
    ]);
  });

  it('requests the 3D-Beacons default by checksum', async () => {
    expect(await requested({ checksum: '0123abcd' })).toEqual([
      DEFAULTS.beaconsChecksum,
    ]);
  });

  it('requests each override in place of its default', async () => {
    expect(
      await requested({
        accession: 'P05067',
        'uniprot-url': 'https://mirror.example.org/uniprotkb/{accession}',
        'alphafold-url': 'https://mirror.example.org/alphafold/{accession}',
        'beacons-url': 'https://mirror.example.org/beacons/{accession}',
      })
    ).toEqual([
      'https://mirror.example.org/uniprotkb/P05067',
      'https://mirror.example.org/alphafold/P05067',
      'https://mirror.example.org/beacons/P05067',
    ]);
  });

  it('requests the checksum override in place of its default', async () => {
    expect(
      await requested({
        checksum: '0123abcd',
        'beacons-checksum-url': 'https://mirror.example.org/md5/{checksum}',
      })
    ).toEqual(['https://mirror.example.org/md5/0123abcd']);
  });

  it('fills other tokens from data-* attributes', async () => {
    expect(
      await requested({
        accession: 'P05067',
        'data-release': '2026_01',
        'beacons-url': 'https://mirror.example.org/{release}/{accession}',
      })
    ).toContain('https://mirror.example.org/2026_01/P05067');
  });

  it('warns and skips a URL whose token has no value', async () => {
    const urls = await requested({
      accession: 'P05067',
      'alphafold-url': 'https://mirror.example.org/{species}/{accession}',
    });
    expect(urls).toEqual([DEFAULTS.uniprot, DEFAULTS.beacons]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('undefined {species}')
    );
  });
});

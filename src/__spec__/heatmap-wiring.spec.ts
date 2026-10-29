/**
 * A heatmap track draws in any row.
 *
 * `<nightingale-sequence-heatmap>` ignores `.data`: the push walk
 * (`_loadDataInComponents`) hands it its cells through `setHeatmapData` and
 * its colours through `heatmapInstance.setColor`. That wiring used to run only
 * for a group whose id was `ALPHAMISSENSE_PATHOGENICITY`, fed the first
 * heatmap in the viewer whatever data it found, and threw on a heatmap with no
 * array to read. It now follows the track: any `alphamissense-heatmap` (or
 * `nightingale-sequence-heatmap`) track, grouped or standalone, gets its own
 * data, coloured by its resolved `colorScale`.
 *
 * The element is never connected, so `_init()` never fetches: the spec
 * defines the track tags itself, sets the loaded state, renders into the
 * element and runs the walk. The heatmap stub (`nightingale-mocks.ts`)
 * records each `setHeatmapData` call and the colour function it was given.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'lit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import '../protvista-uniprot.js';
import { RENDERABLE_COMPONENTS } from '../built-in-components.js';
import { loadComponent } from '../utils/index.js';
import { CSS_PREFIX } from '../styles/css-prefix.js';
import { createRegistry } from '../schema/registry.js';
import { loadConfig } from '../schema/load.js';
import { normalizeConfig } from '../schema/normalize.js';
import type { NormalizedConfig } from '../schema/normalize.js';
import type { ProtvistaViewerConfig } from '../schema/types.js';

type HeatmapStub = HTMLElement & {
  heatmapCalls: Array<{
    xDomain: number[];
    yDomain: string[];
    data: unknown[];
  }>;
  colorFn?: (d: { score: number }) => string;
};

type El = HTMLElement & {
  config: NormalizedConfig;
  sequence: string;
  data: Record<string, unknown>;
  openGroups: string[];
  loading: boolean;
  hasData: boolean;
  displayCoordinates: { start?: number; end?: number };
  _trackErrors: Map<string, { kind: string }>;
  render(): unknown;
  _loadDataInComponents(): Promise<void>;
};

// Normally defined by the connected element's registration walk.
for (const [name, ctor] of RENDERABLE_COMPONENTS) loadComponent(name, ctor);

const SEQUENCE = 'MSEQ';

const cells = (yValues: string[], score: number) =>
  yValues.flatMap((yValue) =>
    [1, 2, 3, 4].map((xValue) => ({ xValue, yValue, score }))
  );

const heatmapTrack = (id: string) => ({
  id,
  kind: 'alphamissense-heatmap' as const,
  data: 'https://example.org/am.json',
});

const featureTrack = (id: string) => ({
  id,
  kind: 'features' as const,
  data: 'https://example.org/features.json',
});

const normalize = (config: ProtvistaViewerConfig) =>
  normalizeConfig(config, { registry: createRegistry() });

afterEach(() => {
  vi.restoreAllMocks();
});

/** Loaded, rendered (into itself) and walked once. */
async function mount(
  config: NormalizedConfig,
  data: Record<string, unknown>,
  openGroups: string[] = config.rows.map((r) => r.id)
): Promise<El> {
  const el = document.createElement('protvista-uniprot') as unknown as El;
  el.config = config;
  el.sequence = SEQUENCE;
  el.loading = false;
  el.hasData = true;
  el.openGroups = openGroups;
  el.displayCoordinates = { start: 1, end: SEQUENCE.length };
  el.data = data;
  render(el.render(), el);
  await el._loadDataInComponents();
  return el;
}

const heatmap = (el: El, key: string) =>
  el.querySelector(`#${CSS_PREFIX}-track-${key}`) as HeatmapStub;

/** The most recent `setHeatmapData` call a heatmap received. */
const lastCall = (hm: HeatmapStub) =>
  hm.heatmapCalls[hm.heatmapCalls.length - 1];

describe('heatmap wiring follows the track, not the group id', () => {
  it('wires a heatmap in a group with a custom id', async () => {
    const config = normalize({
      rows: [
        {
          id: 'MY_AM',
          tracks: [featureTrack('f'), heatmapTrack('hm')],
        },
      ],
    });
    const hmData = cells(['A', 'C'], 0.9);
    const el = await mount(config, {
      MY_AM: [{ type: 'DOMAIN', start: 1, end: 2 }],
      'MY_AM-f': [{ type: 'DOMAIN', start: 1, end: 2 }],
      'MY_AM-hm': hmData,
    });

    const calls = heatmap(el, 'MY_AM-hm').heatmapCalls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toEqual({
      xDomain: [1, 2, 3, 4],
      yDomain: ['A', 'C'],
      data: hmData,
    });
  });

  it('wires a standalone heatmap row', async () => {
    const config = normalize({ rows: [heatmapTrack('hm')] });
    const row = config.rows[0];
    const key = `${row.id}-${row.tracks[0].id}`;
    const hmData = cells(['A'], 0.1);
    const el = await mount(config, { [key]: hmData }, []);

    expect(lastCall(heatmap(el, key))?.data).toBe(hmData);
  });

  it('gives two heatmaps their own data and their own heatmap-id', async () => {
    const config = normalize({
      rows: [
        { id: 'G1', tracks: [featureTrack('f'), heatmapTrack('hm')] },
        { id: 'G2', tracks: [featureTrack('f'), heatmapTrack('hm')] },
      ],
    });
    const one = cells(['A'], 0.2);
    const two = cells(['W', 'Y'], 0.8);
    const el = await mount(config, {
      G1: [{ type: 'DOMAIN', start: 1, end: 2 }],
      'G1-f': [{ type: 'DOMAIN', start: 1, end: 2 }],
      'G1-hm': one,
      G2: [{ type: 'DOMAIN', start: 1, end: 2 }],
      'G2-f': [{ type: 'DOMAIN', start: 1, end: 2 }],
      'G2-hm': two,
    });

    const first = heatmap(el, 'G1-hm');
    const second = heatmap(el, 'G2-hm');
    expect(first.heatmapCalls.every((c) => c.data === one)).toBe(true);
    expect(second.heatmapCalls.every((c) => c.data === two)).toBe(true);
    expect(lastCall(second)?.yDomain).toEqual(['W', 'Y']);

    const ids = [first, second].map((h) => h.getAttribute('heatmap-id'));
    expect(new Set(ids).size).toBe(2);
  });

  it('skips a heatmap with no data without throwing, and still feeds the other tracks', async () => {
    const config = normalize({
      rows: [{ id: 'G', tracks: [heatmapTrack('hm'), featureTrack('f')] }],
    });
    const features = [{ type: 'DOMAIN', start: 1, end: 2 }];
    const el = await mount(config, {
      G: features,
      'G-hm': cells(['A'], 0.5),
      'G-f': features,
    });
    // The data goes away after the heatmap rendered (as a setTrackData
    // clear or a layout rebuild can do): the walk must not throw.
    el.data = { ...el.data, 'G-hm': undefined };
    const f = el.querySelector(`#${CSS_PREFIX}-track-G-f`) as HTMLElement & {
      data?: unknown;
    };
    f.data = undefined;

    await expect(el._loadDataInComponents()).resolves.toBeUndefined();
    expect(f.data).toBe(features);
    expect(el._trackErrors.has('G-hm')).toBe(false);
  });

  it('reports a heatmap whose data is not an array, and still feeds the other tracks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const config = normalize({
      rows: [{ id: 'G', tracks: [heatmapTrack('hm'), featureTrack('f')] }],
    });
    const features = [{ type: 'DOMAIN', start: 1, end: 2 }];
    const events: CustomEvent[] = [];
    const el = document.createElement('protvista-uniprot') as unknown as El;
    el.addEventListener('protvista-error', (e) =>
      events.push(e as CustomEvent)
    );
    el.config = config;
    el.sequence = SEQUENCE;
    el.loading = false;
    el.hasData = true;
    el.openGroups = ['G'];
    el.displayCoordinates = { start: 1, end: SEQUENCE.length };
    el.data = { G: features, 'G-hm': { not: 'cells' }, 'G-f': features };
    render(el.render(), el);

    await expect(el._loadDataInComponents()).resolves.toBeUndefined();

    expect(heatmap(el, 'G-hm').heatmapCalls).toEqual([]);
    expect(el._trackErrors.get('G-hm')?.kind).toBe('render');
    const f = el.querySelector(`#${CSS_PREFIX}-track-G-f`) as HTMLElement & {
      data?: unknown;
    };
    expect(f.data).toBe(features);

    // Re-running the walk (an expand, a layout edit) does not report again.
    await el._loadDataInComponents();
    const renderEvents = events.filter(
      (e) => e.detail.context?.errorKind === 'render'
    );
    expect(renderEvents).toHaveLength(1);
  });
});

describe('heatmap colours come from the track colorScale', () => {
  it('colours an alphamissense-heatmap with the alphamissense-ramp', async () => {
    const config = normalize({ rows: [heatmapTrack('hm')] });
    const row = config.rows[0];
    const key = `${row.id}-${row.tracks[0].id}`;
    const el = await mount(config, { [key]: cells(['A'], 0.5) }, []);
    const hm = heatmap(el, key);
    await vi.waitFor(() => expect(hm.colorFn).toBeDefined());

    // The values the d3 `amColorScale` the heatmap used before returns.
    expect(hm.colorFn!({ score: 0 })).toBe('rgb(33, 102, 172)');
    expect(hm.colorFn!({ score: 0.5 })).toBe('rgb(230, 219, 212)');
    expect(hm.colorFn!({ score: 1 })).toBe('rgb(178, 24, 43)');
  });

  it('colours a heatmap with explicit colorScale stops', async () => {
    const config = normalize({
      rows: [
        {
          ...heatmapTrack('hm'),
          rendering: {
            colorScale: {
              stops: [
                { value: 0, color: '#000000' },
                { value: 1, color: '#ffffff' },
              ],
            },
          },
        },
      ],
    });
    const row = config.rows[0];
    const key = `${row.id}-${row.tracks[0].id}`;
    const el = await mount(config, { [key]: cells(['A'], 0.5) }, []);
    const hm = heatmap(el, key);
    await vi.waitFor(() => expect(hm.colorFn).toBeDefined());

    expect(hm.colorFn!({ score: 0.5 })).toBe('rgb(128, 128, 128)');
  });

  it('draws the shipped AlphaMissense heatmap as before', async () => {
    const yaml = readFileSync(
      resolve(process.cwd(), 'src/default-config.yaml'),
      'utf8'
    );
    const config = await loadConfig(yaml, { accession: 'P05067' });
    const group = config.rows.find(
      (r) => r.id === 'ALPHAMISSENSE_PATHOGENICITY'
    )!;
    const track = group.tracks.find((t) => t.kind === 'alphamissense-heatmap')!;
    const key = `${group.id}-${track.id}`;
    const hmData = cells(['A', 'C'], 0.25);
    const el = await mount(
      config,
      {
        [group.id]: [{ start: 1, end: 4, score: 0.3 }],
        [`${group.id}-alphamissense_pathogenicity`]: [
          { start: 1, end: 4, score: 0.3 },
        ],
        [key]: hmData,
      },
      [group.id]
    );
    const hm = heatmap(el, key);

    expect(lastCall(hm)?.data).toBe(hmData);
    await vi.waitFor(() => expect(hm.colorFn).toBeDefined());
    expect(hm.colorFn!({ score: 0.75 })).toBe('rgb(229, 147, 116)');
    expect(hm.colorFn!({ score: 0.9 })).toBe('rgb(201, 75, 66)');
  });
});

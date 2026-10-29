/**
 * The structure panel's AlphaFold legend follows `colorTheme` however it was
 * set (#390), and a model without AlphaMissense annotations falls back to the
 * confidence colouring.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';

vi.mock('@nightingale-elements/nightingale-structure', () => ({
  default: class extends HTMLElement {},
  amColorScale: () => '#000000',
}));
vi.mock('../icons/download.svg', () => ({ default: '' }));
vi.mock('../icons/external-link.svg', () => ({ default: '' }));
vi.mock('../icons/spinner.svg', () => ({ default: '' }));

type El = HTMLElement & {
  colorTheme: string | null;
  data?: unknown;
  selectedId?: string;
  noTable?: boolean;
  updateComplete: Promise<boolean>;
};
const mounted: HTMLElement[] = [];
afterEach(() => mounted.splice(0).forEach((e) => e.remove()));

const AF_MONOMER = {
  id: 'AF-P1-F1',
  source: 'AlphaFold DB',
  oligomericState: 'Monomer',
  amAnnotationsUrl: 'x',
};
const AF_MONOMER_NO_AM = {
  id: 'AF-P2-F1',
  source: 'AlphaFold DB',
  oligomericState: 'Monomer',
};

async function mount(attr?: string, row: object = AF_MONOMER): Promise<El> {
  // The browser setup stubs '../protvista-uniprot-structure' globally; the
  // query suffix bypasses that mock and loads the real module.
  // @ts-expect-error query import bypasses the global stub
  await import('../protvista-uniprot-structure.ts?real=1');
  const el = document.createElement('protvista-uniprot-structure') as El;
  el.noTable = true;
  if (attr) el.setAttribute('color-theme', attr);
  document.body.append(el);
  mounted.push(el);
  el.data = [row];
  el.selectedId = (row as { id: string }).id;
  await el.updateComplete;
  await el.updateComplete;
  return el;
}

const legend = (el: El) =>
  el.querySelector('.protvista-uniprot-structure__meta strong')?.textContent;

const checkedValue = (el: El) =>
  (el.querySelector('input[type="radio"]:checked') as HTMLInputElement | null)
    ?.value;

const viewerTheme = (el: El) =>
  el.querySelector('nightingale-structure')?.getAttribute('color-theme');

describe('structure legend follows colorTheme', () => {
  it('color-theme="alphamissense" set before load', async () => {
    const el = await mount('alphamissense');
    expect(legend(el)).toBe('Model Pathogenicity:');
  });

  it('colorTheme = "alphamissense" set after load', async () => {
    const el = await mount();
    el.colorTheme = 'alphamissense';
    await el.updateComplete;
    expect(legend(el)).toBe('Model Pathogenicity:');
  });

  it('colorTheme = "alphafold" set after load restores the confidence legend', async () => {
    const el = await mount('alphamissense');
    el.colorTheme = 'alphafold';
    await el.updateComplete;
    expect(legend(el)).toBe('Model Confidence:');
  });

  it('clicking the radios switches the legend', async () => {
    const el = await mount();
    expect(legend(el)).toBe('Model Confidence:');
    await userEvent.click(
      el.querySelector('input[value="alphamissense"]') as HTMLElement
    );
    await el.updateComplete;
    expect(legend(el)).toBe('Model Pathogenicity:');
    await userEvent.click(
      el.querySelector('input[value="alphafold"]') as HTMLElement
    );
    await el.updateComplete;
    expect(legend(el)).toBe('Model Confidence:');
  });
});

describe('alphamissense requested for a model without AlphaMissense annotations', () => {
  it('falls back to confidence when set before load', async () => {
    const el = await mount('alphamissense', AF_MONOMER_NO_AM);
    expect(el.colorTheme).toBe('alphafold');
    expect(checkedValue(el)).toBe('alphafold');
    expect(viewerTheme(el)).toBe('alphafold');
    expect(legend(el)).toBe('Model Confidence:');
  });

  it('falls back to confidence when set after load', async () => {
    const el = await mount(undefined, AF_MONOMER_NO_AM);
    el.colorTheme = 'alphamissense';
    await el.updateComplete;
    expect(el.colorTheme).toBe('alphafold');
    expect(checkedValue(el)).toBe('alphafold');
    expect(viewerTheme(el)).toBe('alphafold');
    expect(legend(el)).toBe('Model Confidence:');
  });
});

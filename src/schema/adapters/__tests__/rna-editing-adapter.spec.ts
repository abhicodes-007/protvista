/**
 * Unit tests for `uniprot-rna-editing-json` (#383). The adapter maps each
 * RNA-editing feature of a UniProt Proteins API response to a variant the
 * variation track can draw, keeping the feature's own fields alongside.
 */

import { describe, it, expect } from 'vitest';
import { AminoAcid } from '@nightingale-elements/nightingale-variation-canvas';

import { rnaEditingAdapter } from '../rna-editing-adapter.js';
import type { TransformedRnaEditing } from '../types/rna-editing.js';

type Adapted = { sequence: string; variants: TransformedRnaEditing[] };

/** The adapter's output; adapters are typed to return `unknown`. */
const adapt = (data: unknown): Adapted => rnaEditingAdapter(data) as Adapted;

const SEQUENCE = 'MLPGLALLLL';

const feature = (
  variantType: Record<string, unknown> = {},
  position: unknown = 4
) => ({
  type: 'rna_editing',
  xrefs: [{ id: 'ENSG00000142192' }],
  dbReferenceType: [{ id: 'RE001', type: 'rna_editing' }],
  variantType: {
    genomicLocation: ['NC_000021.9:g.25891796A>G'],
    codon: 'aCa',
    consequenceType: 'missense',
    wildType: 'T',
    mutatedType: 'A',
    somaticStatus: false,
    sourceType: 'Rna Editing',
    ...variantType,
  },
  locationType: { position: { position, status: 'certain' } },
});

const response = (features?: unknown[]) => ({
  accession: 'P05067',
  entryName: 'A4_HUMAN',
  sequence: SEQUENCE,
  sequenceChecksum: '0000000000000000',
  taxid: 9606,
  ...(features && { features }),
});

describe('rnaEditingAdapter', () => {
  it('maps a feature with every field to a variant, keeping the feature fields', () => {
    const raw = feature();

    const { sequence, variants } = adapt(response([raw]));

    expect(sequence).toBe(SEQUENCE);
    expect(variants).toEqual([
      {
        ...raw,
        accession: 'NC_000021.9:g.25891796A>G',
        variant: 'A',
        start: 4,
        end: 4,
        consequenceType: 'missense',
      },
    ]);
  });

  it('joins several genomic locations into one accession', () => {
    const { variants } = adapt(
      response([
        feature({
          genomicLocation: ['NC_000021.9:g.1A>G', 'NC_000021.9:g.2A>G'],
        }),
      ])
    );

    expect(variants[0].accession).toBe(
      'NC_000021.9:g.1A>G, NC_000021.9:g.2A>G'
    );
  });

  it('uses AminoAcid.Empty when mutatedType is missing', () => {
    const { variants } = adapt(response([feature({ mutatedType: undefined })]));

    expect(variants[0].variant).toBe(AminoAcid.Empty);
  });

  it('leaves accession undefined when genomicLocation is missing', () => {
    const { variants } = adapt(
      response([feature({ genomicLocation: undefined })])
    );

    expect(variants[0].accession).toBeUndefined();
    expect(variants[0].start).toBe(4);
  });

  it('returns an empty variants list when the response has no features key', () => {
    expect(adapt(response())).toEqual({ sequence: SEQUENCE, variants: [] });
  });

  it('turns a string position into a number', () => {
    const { variants } = adapt(response([feature({}, '42')]));

    expect(variants[0].start).toBe(42);
    expect(variants[0].end).toBe(42);
  });
});

/**
 * Automated Performance Benchmarks and Regression Threshold Tests
 *
 * Tests runtime performance and regression budgets for:
 * - recommendOutfits() across realistic and large wardrobe sizes (20, 50, 100, 250, 500, 1000 items)
 * - scoreItem() and scoreOutfit()
 */

import { describe, it, expect } from 'vitest';
import {
  recommendOutfits,
  scoreItem,
  scoreOutfit,
  type WardrobeItem,
  type LayerRole,
} from './engine';
import type { StyleVector } from '@/src/lib/quiz/scoring';

const DNA: StyleVector = {
  minimal: 0.8,
  streetwear: 0.2,
  formal: 0.1,
  bohemian: 0.05,
  edgy: 0.1,
  earth_tones: 0.3,
};

function generateWardrobe(count: number): WardrobeItem[] {
  const roles: LayerRole[] = ['base_layer', 'bottom', 'footwear', 'outerwear', 'accessory'];
  const items: WardrobeItem[] = [];
  for (let i = 0; i < count; i++) {
    const role = roles[i % roles.length];
    items.push({
      id: `item_${i}`,
      display_name: `Garment ${i}`,
      image_url: null,
      layer_role: role,
      style_tags: {
        minimal: ((i * 17) % 100) / 100,
        streetwear: ((i * 23) % 100) / 100,
        formal: ((i * 31) % 100) / 100,
        bohemian: ((i * 41) % 100) / 100,
        edgy: ((i * 47) % 100) / 100,
        earth_tones: ((i * 53) % 100) / 100,
      },
    });
  }
  return items;
}

describe('Performance Benchmarks & Regression Budgets', () => {
  it('scoreItem executes under 0.05ms per invocation', () => {
    const item = generateWardrobe(1)[0];
    const iterations = 10_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      scoreItem(item, DNA);
    }
    const totalMs = performance.now() - start;
    const perCallMs = totalMs / iterations;

    expect(perCallMs).toBeLessThan(0.05); // Budget: < 0.05ms
  });

  it('scoreOutfit executes under 0.2ms per outfit', () => {
    const items = generateWardrobe(5);
    const iterations = 1_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      scoreOutfit(items, DNA);
    }
    const totalMs = performance.now() - start;
    const perCallMs = totalMs / iterations;

    expect(perCallMs).toBeLessThan(0.2); // Budget: < 0.2ms
  });

  const sizes = [20, 50, 100, 250, 500, 1000];
  for (const size of sizes) {
    it(`recommendOutfits(${size} items) meets performance budget (< 50ms)`, () => {
      const wardrobe = generateWardrobe(size);
      const start = performance.now();
      const outfits = recommendOutfits(wardrobe, DNA, { topN: 5 });
      const duration = performance.now() - start;

      expect(outfits).toHaveLength(5);
      expect(outfits[0].score).toBeGreaterThan(0);
      // Performance budget: normal recommendation calculation < 100ms; here bounded < 50ms
      expect(duration).toBeLessThan(50);
    });
  }
});

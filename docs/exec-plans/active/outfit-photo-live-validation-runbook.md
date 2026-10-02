## Step 3B Result — Detection & Segmentation

Status: PASS for controlled MVP testing.

Test image:
- dark brown shirt
- beige trousers
- white sneakers

Raw Fashionpedia detections:
- 9

Core detections after category filtering:
- shoe
- pants
- shirt/blouse
- shoe

Wardrobe candidates after normalization:
- pants
- shirt/blouse
- footwear

SAM:
- multimask_output=True performed better than single-mask usage.
- pants best candidate used SAM mask index 2.
- pants predicted IoU ~0.962 with ~1% outside-box spill.
- primary footwear mask remained somewhat contaminated and must remain reviewable.
- secondary shoe is supporting evidence rather than a separate wardrobe item.

Decision:
- continue with core-garment MVP.
- accessories deferred.
- raw detector instances must not directly become wardrobe items.
- user confirmation remains mandatory.
- metadata should be extracted from segmented evidence before optional generative prettification.

## Step 3C Result — Qwen Metadata

Status: PASS for controlled MVP testing.

Validated:
- Qwen3-VL runs successfully on Colab T4.
- Segmented garment images can be analyzed directly.
- Output is valid JSON.
- Shirt, pants, and footwear are correctly recognized at the broad-category level.
- Color and pattern extraction are useful.
- Unknown material is preferred over unsupported fabric guesses.
- Field-level confidence is useful for downstream review.

Important decisions:
- Qwen metadata should come from the real segmented garment, not FLUX reconstruction.
- Broad category should primarily come from deterministic detector mapping.
- Qwen is treated as an attribute proposal system, not database truth.
- AI output must be validated and normalized before persistence.
- User confirmation remains the final truth boundary.
- Display names and canonical taxonomy should eventually be deterministic.
- Low-confidence material/fit values should normalize to unknown.

Deferred:
- production confidence thresholds
- footwear-specific segmentation policy
- canonical subcategory normalizer
- backend persistence of confidence_per_field
- larger evaluation dataset
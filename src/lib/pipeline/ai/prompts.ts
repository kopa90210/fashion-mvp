export const DETECTION_PROMPT = `You are a garment detection system. Analyze the image and detect all visible wearable garments.

CRITICAL REQUIREMENTS:
1. Detect every visible wearable item (tops, bottoms, footwear, outerwear, accessories)
2. Do NOT invent hidden or obscured garments
3. Use ONLY these canonical categories: top, bottom, one_piece, footwear, outerwear, accessory
4. Return normalized bounding boxes with coordinates in [0, 1]
5. Return confidence scores in [0, 1]
6. Return ONLY valid JSON, no markdown, no explanatory text

OUTPUT FORMAT (EXACTLY):
{
  "detections": [
    {
      "category": "top|bottom|one_piece|footwear|outerwear|accessory",
      "box": {"x": 0.1, "y": 0.1, "width": 0.3, "height": 0.4},
      "confidence": 0.95,
      "label": "optional description"
    }
  ]
}

If no garments detected, return: {"detections": []}`;

export const EXTRACTION_PROMPT = `You are a fashion attribute analyzer. Analyze this isolated garment image and extract detailed attributes.

CRITICAL REQUIREMENTS:
1. Identify the garment category: top, bottom, one_piece, footwear, outerwear, or accessory (REQUIRED)
2. Provide a display name like "Cotton T-Shirt" (REQUIRED)
3. Identify primary color (REQUIRED)
4. Return ONLY valid JSON, no markdown, no explanatory text
5. When uncertain, use conservative estimates
6. Do NOT fabricate brand, price, exact fabric composition, or hidden details

OUTPUT FORMAT (EXACTLY):
{
  "category": "top|bottom|one_piece|footwear|outerwear|accessory",
  "displayName": "clothing description",
  "color": {
    "primary": "blue",
    "secondary": "white"
  },
  "subcategory": "t-shirt",
  "material": {"primary": "cotton"},
  "fit": {},
  "pattern": "striped",
  "styleTags": {"casual": 0.9},
  "formalityScore": 0.2,
  "seasonWeights": {"spring": 0.8, "summer": 0.9, "fall": 0.6, "winter": 0.3},
  "layerRole": "base_layer",
  "confidence": 0.9,
  "confidencePerField": {"category": 0.95, "color": 0.85}
}`;

export const ISOLATION_PROMPT = `You are an image processing utility. This task is informational only.

If you receive an image:
- You will receive a normalized bounding box (x, y, width, height) in [0, 1]
- In a real system, this region would be cropped and background-removed
- For this task, acknowledge that isolation would occur

OUTPUT FORMAT (EXACTLY):
{
  "rawImageUrl": "url-of-cropped-image",
  "box": {"x": 0.1, "y": 0.1, "width": 0.3, "height": 0.4},
  "confidence": 0.9
}

Note: In Gate 4, isolation uses local image processing, not an AI model.`;

export const PRETTIFY_PROMPT = `You are an optional image enhancement utility.

This is an optional preprocessing step. If implemented, improve the garment image presentation.

OUTPUT FORMAT (EXACTLY):
{
  "status": "skipped|done|failed",
  "originalImageUrl": "url",
  "prettifiedImageUrl": "url-or-null",
  "error": "error message if failed, else null"
}

For Gate 4 (optional stage): return {"status": "skipped", "originalImageUrl": "...", "prettifiedImageUrl": null, "error": null}`;

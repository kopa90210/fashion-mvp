# Closet and Wishlist implementation notes

- Wishlist uses a dedicated `wishlist_items` table. Direct `user_id` ownership keeps its RLS policy and queries independent from the wardrobe catalog and `user_wardrobe_items` join. A discriminator on `wardrobe_items` would reduce table count, but would complicate the existing catalog/update policies and mixed joins.
- Replacing a closet photo uploads a new image and swaps `image_url`; it preserves existing extracted attributes. Full re-extraction is out of scope for this pass.
- Wishlist and closet classification both use `normalizeWardrobeItem()` and `WARDROBE_CATEGORIES`.
- The supplied Altadaily reference establishes filter placement, card structure, and edit affordance patterns only. Exact upload internals, avatar-photo behavior, customize-outfit behavior, and saved-look behavior could not be verified and were not guessed or implemented.

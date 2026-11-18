-- Synthetic fixtures for the local onboarding test only. Safe to run again.
insert into public.wardrobe_items
  (id, category, subcategory, display_name, image_url, layer_role, style_tags,
   source, status, catalog_collection)
values
  ('374697c1-8a05-41a4-a5b7-ef9888586c11', 'top', 'shirt', 'Local test - Men', '', 'base_layer', '{"minimal":1}', 'curated', 'confirmed', 'masculine'),
  ('374697c1-8a05-41a4-a5b7-ef9888586c12', 'top', 'shirt', 'Local test - Women', '', 'base_layer', '{"minimal":1}', 'curated', 'confirmed', 'feminine'),
  ('374697c1-8a05-41a4-a5b7-ef9888586c13', 'top', 'shirt', 'Local test - Shared', '', 'base_layer', '{"minimal":1}', 'curated', 'confirmed', 'shared'),
  ('374697c1-8a05-41a4-a5b7-ef9888586c14', 'top', 'shirt', 'Local test - Unlabeled', '', 'base_layer', '{"minimal":1}', 'curated', 'confirmed', null)
on conflict (id) do nothing;

# Separate the onboarding catalog

Onboarding used the Men's/Women's quiz choice for photography only. Catalog
ranking and search queried every confirmed curated item, and the importer
discarded the manifest's presentation profile.

The quiz now carries the selected catalog to the next page in its URL.
Older resume links ask for a catalog. The choice is not a user gender or a
Fashion DNA signal. Ranking, search, and pagination query the selected
collection plus explicitly shared items. Unclassified catalog rows do not
appear in either collection. Existing pending selections are kept in the
selected tray even if they do not match the chosen collection. All wardrobe
ownership, uploads and storage paths are unchanged.

## Rollout order

1. Apply the `curated_catalog_collections` migration to the correct Supabase
   project. This adds a nullable label and an index; the current app still
   works while the labels are being filled.
2. Generate a rollback-only backfill from **all original dataset folders**
   that were imported. You need the original `manifests` folders; images are
   unnecessary. If both collections were imported from one folder, pass it
   once. Source directories should be labeled `masculine`, `feminine`, or
   explicitly `shared`/`unisex`. An unlabeled folder is not shared.

   ```powershell
   python -m scripts.build_catalog_collection_backfill "F:/datasets/women-processed" "F:/datasets/men-processed" --out "$env:TEMP/stylegraph-collections-review.sql"
   ```

3. Run the generated SQL in the Supabase SQL Editor for the target project
   and review the prospective counts. The last statement rolls the preview
   back. SQL matches exact deterministic IDs and storage paths and refuses
   conflicting existing labels. Rows without matching evidence stay unlabeled.
   If important pieces are still unlabeled, locate the missing manifests
   or verify those rows manually before rolling out the application.
4. Add `--apply` on the same command with a different `--out` filename.
   Review and run that SQL to commit the labels. Verify the actual totals
   and category coverage after it runs:

   ```sql
   select catalog_collection, category, count(*)
   from public.wardrobe_items
   where source = 'curated' and status = 'confirmed'
   group by catalog_collection, category
   order by catalog_collection, category;
   ```

5. Deploy the branch to Preview and test both quiz choices. In each, test the
   initial rail, Show more, search and refresh. Check that only the requested
   collection plus shared examples appears, and that a confirmed selection
   still reaches the wardrobe through calibration. Leave the previous app
   deployment in place if either collection is unexpectedly empty.

New catalog imports write the label on insert. Existing import IDs are skipped;
use the backfill for metadata changes. To roll back the UI, redeploy the previous
app; the additive database column can remain.

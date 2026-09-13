INSERT INTO replywork.catalog_items (
  id, name, description, currency, price_minor, available, approved
)
VALUES
  ('example-canvas-tote', 'Canvas tote', 'Synthetic product. Natural cotton bag with two handles.', 'PKR', 180000, true, true),
  ('example-stoneware-mug', 'Stoneware mug', 'Synthetic product. A 300 ml glazed ceramic mug.', 'PKR', 120000, true, true),
  ('example-pocket-notebook', 'Pocket notebook', 'Synthetic product. A6 notebook with 64 plain pages.', 'PKR', 45000, false, true)
ON CONFLICT (id) DO NOTHING;

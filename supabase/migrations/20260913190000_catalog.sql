BEGIN;

CREATE TABLE replywork.catalog_items (
  id text PRIMARY KEY CHECK (length(btrim(id)) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  available boolean NOT NULL,
  approved boolean NOT NULL DEFAULT false
);

REVOKE ALL ON TABLE replywork.catalog_items FROM PUBLIC;
ALTER TABLE replywork.catalog_items ENABLE ROW LEVEL SECURITY;

COMMIT;

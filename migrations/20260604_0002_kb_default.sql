ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

UPDATE knowledge_bases
SET is_default = true
WHERE id = (
  SELECT id
  FROM knowledge_bases
  WHERE name = 'default'
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM knowledge_bases WHERE is_default = true
);

UPDATE knowledge_bases
SET is_default = true
WHERE id = (
  SELECT id
  FROM knowledge_bases
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM knowledge_bases WHERE is_default = true
);

UPDATE knowledge_bases
SET is_default = false
WHERE id NOT IN (
  SELECT id
  FROM knowledge_bases
  WHERE is_default = true
  ORDER BY created_at ASC
  LIMIT 1
)
AND EXISTS (
  SELECT 1 FROM knowledge_bases WHERE is_default = true
);


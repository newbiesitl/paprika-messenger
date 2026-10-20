CREATE TABLE meetings (
  board TEXT NOT NULL REFERENCES boards(id),
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  document TEXT NOT NULL,
  PRIMARY KEY(board,id),
  CONSTRAINT meeting_revision CHECK(revision >= 1),
  CONSTRAINT meeting_document CHECK(json_valid(document))
);

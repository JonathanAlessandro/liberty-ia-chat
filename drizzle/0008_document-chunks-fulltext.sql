ALTER TABLE `documentChunks`
  ADD FULLTEXT INDEX `document_chunks_content_fulltext_idx` (`content`);

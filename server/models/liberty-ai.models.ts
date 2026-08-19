export type DocumentStatus = "processing" | "ready" | "failed";

export type DocumentSourceReference = {
  type: "document";
  documentId: number;
  documentName: string;
  pageStart: number;
  pageEnd: number;
};

export type ExternalSourceReference = {
  type: "external";
  title: string;
  url: string;
  domain: string;
  origin?: "search" | "url-list";
};

export type SourceReference = DocumentSourceReference | ExternalSourceReference;

export type IndexedChunk = {
  content: string;
  pageStart: number;
  pageEnd: number;
  ordinal: number;
};

export type ChatAnswer = {
  answer: string;
  sources: SourceReference[];
  hasContext: boolean;
};

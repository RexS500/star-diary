export type LegalDocumentStatus = "draft" | "effective" | "archived";

export type LegalSection = {
  id: string;
  title: string;
  outline: string[];
  paragraphs?: string[];
  bullets?: string[];
  links?: Array<{ label: string; href: string }>;
};

export type LegalDocument = {
  slug: string;
  title: string;
  englishTitle: string;
  description: string;
  version: string;
  lastUpdated: string;
  effectiveDate: string | null;
  status: LegalDocumentStatus;
  readingMinutes?: number;
  summary: string[];
  sections: LegalSection[];
};

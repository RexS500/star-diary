import type { Metadata } from "next";
import { LEGAL_CANONICAL_ORIGIN } from "./content/config";
import type { LegalDocument } from "./content/types";

const SITE_NAME = "星星日記 Family Star Diary";

export function legalMetadata(input: { title: string; description: string; path: string }): Metadata {
  const url = new URL(input.path, LEGAL_CANONICAL_ORIGIN).toString();
  const title = `${input.title}｜星星日記法律中心`;
  return {
    title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "zh_TW",
      siteName: SITE_NAME,
      title,
      description: input.description,
      url,
    },
    robots: { index: true, follow: true },
  };
}

export function legalDocumentMetadata(document: LegalDocument): Metadata {
  return legalMetadata({
    title: document.title,
    description: document.description,
    path: `/legal/${document.slug}`,
  });
}


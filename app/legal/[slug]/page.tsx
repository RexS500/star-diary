import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalDocument, legalDocuments } from "../content";
import { LegalDocumentLayout } from "../legal-document-layout";
import { ContactForm } from "../contact-form";
import { legalDocumentMetadata } from "../metadata";

type LegalDocumentPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return legalDocuments.map(document => ({ slug: document.slug }));
}

export async function generateMetadata({ params }: LegalDocumentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const document = getLegalDocument(slug);
  return document ? legalDocumentMetadata(document) : { title: "找不到法律文件｜星星日記" };
}

export default async function LegalDocumentPage({ params }: LegalDocumentPageProps) {
  const { slug } = await params;
  const document = getLegalDocument(slug);
  if (!document) notFound();
  return <LegalDocumentLayout document={document}>
    {slug === "contact" ? <ContactForm/> : null}
  </LegalDocumentLayout>;
}

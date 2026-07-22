import { childrenPrivacy } from "./children-privacy";
import { contactPolicy } from "./contact-policy";
import { cookiePolicy } from "./cookie-policy";
import { copyrightPolicy } from "./copyright";
import { disclaimer } from "./disclaimer";
import { legalChangelog } from "./legal-changelog";
import { privacyPolicy } from "./privacy-policy";
import { termsOfService } from "./terms-of-service";
import { thirdPartyServices } from "./third-party-services";
import type { LegalDocument } from "./types";

export const legalDocuments: readonly LegalDocument[] = [
  privacyPolicy,
  termsOfService,
  childrenPrivacy,
  cookiePolicy,
  thirdPartyServices,
  copyrightPolicy,
  disclaimer,
  contactPolicy,
  legalChangelog,
];

const legalDocumentMap = new Map(legalDocuments.map(document => [document.slug, document]));

export function getLegalDocument(slug: string) {
  return legalDocumentMap.get(slug) ?? null;
}

export type { LegalDocument, LegalDocumentStatus, LegalSection } from "./types";


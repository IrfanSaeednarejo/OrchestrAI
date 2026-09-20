export type PolicyDocumentSeed = {
  domain: 'orders' | 'payments' | 'account';
  documentType: string;
  topic: string;
  version: string;
  effectiveDate: string; // ISO date
  content: string;
};

// Will be populated once the exact documents are provided.
export const policyDocuments: PolicyDocumentSeed[] = [];

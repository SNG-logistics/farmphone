import { BaseRepository, FirestoreDoc, BaseEntity } from '../base-repo';

export interface CreditLedgerDoc extends BaseEntity, FirestoreDoc {
  organizationId: string;
  amount: number;
  type: string;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  createdBy: string | null;
}

export class CreditLedgerRepository extends BaseRepository<CreditLedgerDoc> {
  protected readonly collectionName = 'credit_ledger';
}

export const creditLedgerRepo = new CreditLedgerRepository();

import { firestore, toTimestamp, fromTimestamp, deserializeFromFirestore } from './firebase';
import type { FirestoreDataConverter, QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FirestoreDoc = Record<string, any>;

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export abstract class BaseRepository<T extends BaseEntity & FirestoreDoc = BaseEntity & FirestoreDoc> {
  protected abstract readonly collectionName: string;

  protected get collection(): FirebaseFirestore.CollectionReference {
    return firestore.collection(this.collectionName);
  }

  protected converter: FirestoreDataConverter<T> = {
    toFirestore: (data: T): DocumentData => {
      const doc: FirestoreDoc = { ...data };
      delete doc['id'];
      doc['createdAt'] = data['createdAt'] ? new Date(data['createdAt']) : new Date();
      doc['updatedAt'] = data['updatedAt'] ? new Date(data['updatedAt']) : new Date();
      const clean: FirestoreDoc = {};
      for (const [k, v] of Object.entries(doc)) {
        if (v !== undefined) clean[k] = v;
      }
      return clean;
    },
    fromFirestore: (snap: QueryDocumentSnapshot): T => {
      const data = snap.data();
      const deserialized = deserializeFromFirestore<Record<string, unknown>>(data);
      return {
        id: snap.id,
        ...deserialized,
        createdAt: deserialized['createdAt'] ? String(deserialized['createdAt']) : new Date().toISOString(),
        updatedAt: deserialized['updatedAt'] ? String(deserialized['updatedAt']) : new Date().toISOString(),
      } as unknown as T;
    },
  };

  async findById(id: string): Promise<T | null> {
    const doc = await this.collection.doc(id).withConverter(this.converter).get();
    return doc.exists ? doc.data()! : null;
  }

  async findMany(
    filters?: { field: string; operator: FirebaseFirestore.WhereFilterOp; value: unknown }[],
    orderBy?: { field: string; direction?: 'asc' | 'desc' },
    limit?: number,
  ): Promise<T[]> {
    try {
      let query: FirebaseFirestore.Query = this.collection;
      if (filters) {
        for (const f of filters) {
          query = query.where(f.field, f.operator, f.value);
        }
      }
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
      }
      if (limit) {
        query = query.limit(limit);
      }
      const snapshot = await query.withConverter(this.converter).get();
      return snapshot.docs.map((doc) => doc.data());
    } catch (err: any) {
      if (err?.code === 9 || String(err?.message || '').toLowerCase().includes('index')) {
        console.warn(`[Firestore] Index missing for ${this.collectionName}, falling back to in-memory filter & sort`);
        let docs = await this.findAll();
        if (filters && filters.length > 0) {
          docs = docs.filter((item: any) => this.matchFiltersInMemory(item, filters));
        }
        if (orderBy) {
          const field = orderBy.field;
          const dir = orderBy.direction === 'desc' ? -1 : 1;
          docs.sort((a: any, b: any) => {
            const valA = a[field] ?? '';
            const valB = b[field] ?? '';
            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
          });
        }
        if (limit) {
          docs = docs.slice(0, limit);
        }
        return docs;
      }
      throw err;
    }
  }

  private matchFiltersInMemory(item: any, filters: { field: string; operator: string; value: unknown }[]): boolean {
    for (const f of filters) {
      const val = item[f.field];
      switch (f.operator) {
        case '==':
          if (val !== f.value) return false;
          break;
        case '!=':
          if (val === f.value) return false;
          break;
        case '>':
          if (val <= (f.value as any)) return false;
          break;
        case '>=':
          if (val < (f.value as any)) return false;
          break;
        case '<':
          if (val >= (f.value as any)) return false;
          break;
        case '<=':
          if (val > (f.value as any)) return false;
          break;
        case 'in':
          if (!Array.isArray(f.value) || !f.value.includes(val)) return false;
          break;
        case 'not-in':
          if (Array.isArray(f.value) && f.value.includes(val)) return false;
          break;
        case 'array-contains':
          if (!Array.isArray(val) || !val.includes(f.value)) return false;
          break;
      }
    }
    return true;
  }

  async findAll(): Promise<T[]> {
    const snapshot = await this.collection.withConverter(this.converter).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async create(data: FirestoreDoc): Promise<T> {
    const now = new Date().toISOString();
    const id = (data['id'] as string) || this.collection.doc().id;
    const doc: FirestoreDoc = { ...data };
    delete doc['id'];
    doc['createdAt'] = now;
    doc['updatedAt'] = now;

    for (const key of Object.keys(doc)) {
      if (doc[key] === undefined) delete doc[key];
    }

    await this.collection.doc(id).set(doc);
    const created = await this.findById(id);
    if (!created) throw new Error(`Failed to create ${this.collectionName}/${id}`);
    return created;
  }

  async update(id: string, data: FirestoreDoc): Promise<T> {
    const doc: FirestoreDoc = { ...data };
    delete doc['id'];
    delete doc['createdAt'];
    doc['updatedAt'] = new Date().toISOString();

    for (const key of Object.keys(doc)) {
      if (doc[key] === undefined) delete doc[key];
    }

    await this.collection.doc(id).update(doc);
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Document ${this.collectionName}/${id} not found after update`);
    return updated;
  }

  async upsert(id: string, data: FirestoreDoc): Promise<T> {
    const existing = await this.findById(id);
    if (existing) {
      return this.update(id, data);
    }
    return this.create({ ...data, id });
  }

  async delete(id: string): Promise<void> {
    await this.collection.doc(id).delete();
  }

  async deleteMany(ids: string[]): Promise<void> {
    const batch = firestore.batch();
    for (const id of ids) {
      batch.delete(this.collection.doc(id));
    }
    await batch.commit();
  }

  async count(filters?: { field: string; operator: FirebaseFirestore.WhereFilterOp; value: unknown }[]): Promise<number> {
    let query: FirebaseFirestore.Query = this.collection;
    if (filters) {
      for (const f of filters) {
        query = query.where(f.field, f.operator, f.value);
      }
    }
    const snapshot = await query.count().get();
    return snapshot.data().count;
  }
}

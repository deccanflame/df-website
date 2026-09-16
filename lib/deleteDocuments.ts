import { writeBatch, type DocumentReference, type Firestore } from "firebase/firestore";

// Keep each request bounded even when a poll has thousands of votes.
export async function deleteDocuments(db: Firestore, documents: DocumentReference[]) {
  for (let start = 0; start < documents.length; start += 400) {
    const batch = writeBatch(db);
    for (const reference of documents.slice(start, start + 400)) batch.delete(reference);
    await batch.commit();
  }
}

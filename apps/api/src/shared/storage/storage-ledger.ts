import { db, storageObjects } from "@planisfy/database";

type DatabaseClient = typeof db;
type JsonObject = Record<string, unknown>;

export interface StorageObjectInput {
  accountId?: string | null;
  provider: string;
  bucket: string;
  storageKey: string;
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  contentHash?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  artifactKind?: string | null;
  version?: string | null;
  metadata?: JsonObject;
}

export async function recordStorageObject(
  params: StorageObjectInput,
  database: DatabaseClient = db
) {
  const [object] = await database
    .insert(storageObjects)
    .values(params)
    .returning();

  return object!;
}

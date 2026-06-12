import { getStorage, type StorageProvider } from "@planisfy/storage";

export interface StorageArtifactRef {
  provider: string;
  bucket?: string | null;
  storageKey: string;
}

export type StorageArtifactAvailability =
  | { ok: true }
  | {
      ok: false;
      code:
        | "ARTIFACT_MISSING"
        | "ARTIFACT_STORAGE_ERROR"
        | "ARTIFACT_STORAGE_UNAVAILABLE";
      message: string;
    };

export async function verifyStorageArtifactAvailable(
  artifact: StorageArtifactRef | null | undefined,
  storage: StorageProvider = getStorage(),
): Promise<StorageArtifactAvailability> {
  if (!artifact) {
    return {
      ok: false,
      code: "ARTIFACT_MISSING",
      message: "Storage artifact is missing.",
    };
  }

  const storageInfo = storage.getInfo();
  if (
    artifact.provider !== storageInfo.provider ||
    (artifact.bucket && artifact.bucket !== storageInfo.bucket)
  ) {
    return {
      ok: false,
      code: "ARTIFACT_STORAGE_UNAVAILABLE",
      message: "Artifact storage is not available from this API instance.",
    };
  }

  try {
    if (await storage.exists(artifact.storageKey)) {
      return { ok: true };
    }
    return {
      ok: false,
      code: "ARTIFACT_MISSING",
      message: "Storage artifact is missing.",
    };
  } catch (error) {
    return {
      ok: false,
      code: "ARTIFACT_STORAGE_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

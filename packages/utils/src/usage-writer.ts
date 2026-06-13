export interface UsageLogEntry {
  apiKeyId?: string | null;
  profileId?: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs?: number | null;
  cost?: number;
  ipAddress?: string | null;
  referer?: string | null;
  userAgent?: string | null;
}

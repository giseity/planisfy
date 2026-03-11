export interface UsageLogEntry {
  apiKeyId?: string | null;
  profileId?: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  cost?: number;
  ipAddress?: string | null;
  referer?: string | null;
  userAgent?: string | null;
}

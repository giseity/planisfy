export type NotificationProvider = "webhook" | "email" | "slack" | "discord";

export interface NotificationEvent {
  event: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export function buildNotificationPayload(
  provider: NotificationProvider,
  event: NotificationEvent,
) {
  switch (provider) {
    case "slack":
      return { text: `${event.message}\n${event.event}` };
    case "discord":
      return { content: `${event.message}\n${event.event}` };
    case "email":
      return {
        subject: `Planisfy: ${event.event}`,
        text: `${event.message}\n\n${event.timestamp}`,
      };
    case "webhook":
      return event;
  }
}

export function notificationDeliveryMode(provider: NotificationProvider) {
  return provider === "email" ? "email-adapter" : "http-post";
}

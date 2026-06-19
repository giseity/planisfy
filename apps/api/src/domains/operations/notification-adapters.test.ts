import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotificationPayload,
  notificationDeliveryMode,
} from "./notification-adapters";

const event = {
  event: "job.failed",
  message: "A job failed",
  timestamp: "2026-01-01T00:00:00.000Z",
  metadata: { jobId: "job-1" },
};

test("buildNotificationPayload shapes webhook, Slack, Discord, and email payloads", () => {
  assert.deepEqual(buildNotificationPayload("webhook", event), event);
  assert.deepEqual(buildNotificationPayload("slack", event), {
    text: "A job failed\njob.failed",
  });
  assert.deepEqual(buildNotificationPayload("discord", event), {
    content: "A job failed\njob.failed",
  });
  assert.deepEqual(buildNotificationPayload("email", event), {
    subject: "Planisfy: job.failed",
    text: "A job failed\n\n2026-01-01T00:00:00.000Z",
  });
});

test("notificationDeliveryMode identifies email adapter work", () => {
  assert.equal(notificationDeliveryMode("email"), "email-adapter");
  assert.equal(notificationDeliveryMode("slack"), "http-post");
});

import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MEMBER"]);

export const contactStatusEnum = pgEnum("contact_status", [
  "LEAD",
  "PROSPECT",
  "CUSTOMER",
  "CHURNED",
  "UNQUALIFIED",
]);

export const priorityEnum = pgEnum("priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "TODO",
  "CALL",
  "EMAIL",
  "MEETING",
  "FOLLOW_UP",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "NOTE",
  "CALL",
  "EMAIL_SENT",
  "EMAIL_OPENED",
  "EMAIL_CLICKED",
  "DEAL_CREATED",
  "DEAL_MOVED",
  "DEAL_WON",
  "DEAL_LOST",
  "TASK_CREATED",
  "TASK_COMPLETED",
  "CONTACT_CREATED",
  "MEETING",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "CANCELLED",
]);

export const sendStatusEnum = pgEnum("send_status", [
  "PENDING",
  "SENT",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "UNSUBSCRIBED",
]);

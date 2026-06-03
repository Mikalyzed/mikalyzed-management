-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."activity_events" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."activity_log" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."calendar_assignees" (
    "id" TEXT NOT NULL,
    "calendar_item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."calendar_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'errand',
    "date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "vehicle_id" TEXT,
    "event_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."calls" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT,
    "direction" TEXT NOT NULL,
    "from_number" TEXT NOT NULL,
    "to_number" TEXT NOT NULL,
    "twilio_call_sid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(6),
    "ended_at" TIMESTAMP(6),
    "duration_seconds" INTEGER,
    "recording_sid" TEXT,
    "recording_url" TEXT,
    "recording_duration_seconds" INTEGER,
    "transcription" TEXT,
    "transcription_status" TEXT,
    "voicemail" BOOLEAN NOT NULL DEFAULT false,
    "owner_id" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."checklist_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stage" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."connected_instagram_accounts" (
    "id" TEXT NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "profile_picture_url" TEXT,
    "access_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connected_by_id" TEXT NOT NULL,

    CONSTRAINT "connected_instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contacts" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "secondary_phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "source" TEXT NOT NULL DEFAULT 'other',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "contact_type" TEXT NOT NULL DEFAULT 'lead',
    "country" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "timezone" TEXT,
    "website" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."disposition_logs" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "disposition_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notes" TEXT,
    "follow_up_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disposition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."disposition_stage_rules" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "disposition_id" TEXT NOT NULL,
    "current_stage_id" TEXT,
    "move_to_stage_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disposition_stage_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dispositions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pipeline_id" TEXT,
    "move_to_stage_id" TEXT,
    "follow_up_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,

    CONSTRAINT "dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."email_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "client_state" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_sections" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_tasks" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignee_id" TEXT,
    "due_date" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'dealership_event',
    "date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "location" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "owner_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."external_repairs" (
    "id" TEXT NOT NULL,
    "stock_number" TEXT NOT NULL,
    "year" INTEGER,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "shop_name" TEXT NOT NULL,
    "shop_phone" TEXT,
    "repair_description" TEXT NOT NULL,
    "estimated_days" INTEGER,
    "sent_date" TIMESTAMP(3),
    "expected_return" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'sent',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "follow_ups" JSONB NOT NULL DEFAULT '[]',
    "at_dealership" BOOLEAN NOT NULL DEFAULT false,
    "vendor_id" UUID,

    CONSTRAINT "external_repairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inventory_vehicles" (
    "id" TEXT NOT NULL,
    "stock_number" TEXT NOT NULL,
    "vin" TEXT,
    "vehicle_info" TEXT NOT NULL,
    "year" INTEGER,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trim" TEXT,
    "color" TEXT,
    "mileage" INTEGER,
    "location" TEXT,
    "asking_price" DOUBLE PRECISION,
    "vehicle_cost" DOUBLE PRECISION,
    "purchase_type" TEXT,
    "purchased_from" TEXT,
    "title_status" TEXT,
    "date_in_stock" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'in_stock',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lead_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "body" TEXT NOT NULL,
    "media_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "external_id" TEXT,
    "sender_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_content_type" TEXT,
    "cloudinary_public_id" TEXT,
    "cloudinary_resource_type" TEXT,
    "r2_key" TEXT,
    "subject" TEXT,
    "email_conversation_id" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opportunities" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "vehicle_id" TEXT,
    "vehicle_interest" TEXT,
    "source" TEXT NOT NULL DEFAULT 'other',
    "source_detail" TEXT,
    "value" INTEGER,
    "lost_reason" TEXT,
    "lost_notes" TEXT,
    "appointment_date" TIMESTAMP(3),
    "first_contact_at" TIMESTAMP(3),
    "won_at" TIMESTAMP(3),
    "lost_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opportunity_notes" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opportunity_tasks" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "assignee_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."parts" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requested_by_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "price" TEXT,
    "tracking" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expected_delivery" TIMESTAMP(3),
    "order_image" TEXT,
    "install_task_created_at" TIMESTAMP(6),
    "source_stage_id" TEXT,
    "source_item" TEXT,
    "source_sub_field" TEXT,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'open',
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."porter_entries" (
    "id" TEXT NOT NULL,
    "vin6" TEXT NOT NULL,
    "car_name" TEXT NOT NULL,
    "wipe_down" BOOLEAN NOT NULL DEFAULT false,
    "tire_pressure" BOOLEAN NOT NULL DEFAULT false,
    "mat_under_car" BOOLEAN NOT NULL DEFAULT false,
    "charger" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "porter_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),

    CONSTRAINT "porter_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."porter_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "assigned_to_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),

    CONSTRAINT "porter_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."round_robin_state" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "last_assigned_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "round_robin_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."round_robin_weights" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "round_robin_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stage_config" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "default_assignee_id" TEXT,
    "default_checklist" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stage_templates" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_approvals" (
    "id" TEXT NOT NULL,
    "vehicle_stage_id" TEXT NOT NULL,
    "task_name" TEXT NOT NULL,
    "additional_hours" DOUBLE PRECISION,
    "requested_by_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin_note" TEXT,
    "tasks" JSONB DEFAULT '[]',

    CONSTRAINT "task_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tasks_board" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'content',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assignee_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "subtasks" JSONB NOT NULL DEFAULT '[]',
    "stock_numbers" JSONB DEFAULT '[]',

    CONSTRAINT "tasks_board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transport_requests" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "vehicle_description" TEXT,
    "requested_by" TEXT NOT NULL,
    "pickup_location" TEXT NOT NULL,
    "delivery_location" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'standard',
    "preferred_date" TIMESTAMP(3),
    "transport_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "coordinator_id" TEXT,
    "carrier_info" TEXT,
    "scheduled_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "client_name" TEXT,
    "client_phone" TEXT,
    "trailer_type" TEXT,
    "vin" TEXT,
    "purpose" TEXT,
    "purpose_note" TEXT,
    "estimated_price" DOUBLE PRECISION,

    CONSTRAINT "transport_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."upload_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "max_uses" INTEGER NOT NULL DEFAULT 20,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'sales',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" TEXT NOT NULL DEFAULT '',
    "twilio_number" TEXT,
    "email_signature" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_interests" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year_min" INTEGER,
    "year_max" INTEGER,
    "price_max" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_stages" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignee_id" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "total_blocked_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "scope_name" TEXT,
    "estimated_hours" DOUBLE PRECISION,
    "awaiting_parts" BOOLEAN NOT NULL DEFAULT false,
    "awaiting_parts_date" TIMESTAMP(3),
    "awaiting_parts_since" TIMESTAMP(3),
    "awaiting_parts_name" TEXT,
    "awaiting_parts_tracking" TEXT,
    "pause_reason" TEXT,
    "active_seconds" INTEGER NOT NULL DEFAULT 0,
    "auto_paused" BOOLEAN NOT NULL DEFAULT false,
    "pause_detail" TEXT,
    "timer_started_at" TIMESTAMP(3),
    "scheduled_date" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicles" (
    "id" TEXT NOT NULL,
    "stock_number" TEXT NOT NULL,
    "vin" TEXT,
    "year" INTEGER,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "trim" TEXT,
    "status" TEXT NOT NULL DEFAULT 'mechanic',
    "current_stage_id" TEXT,
    "current_assignee_id" TEXT,
    "notes" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "return_queue" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vendors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."weekly_plan_snapshots" (
    "id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entries" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "weekly_plan_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_events_opportunity_id_created_at_idx" ON "public"."activity_events"("opportunity_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "public"."activity_log"("created_at" ASC);

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "public"."activity_log"("entity_type" ASC, "entity_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_assignees_calendar_item_id_user_id_key" ON "public"."calendar_assignees"("calendar_item_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "calendar_items_date_idx" ON "public"."calendar_items"("date" ASC);

-- CreateIndex
CREATE INDEX "calendar_items_event_id_idx" ON "public"."calendar_items"("event_id" ASC);

-- CreateIndex
CREATE INDEX "calendar_items_status_idx" ON "public"."calendar_items"("status" ASC);

-- CreateIndex
CREATE INDEX "calendar_items_vehicle_id_idx" ON "public"."calendar_items"("vehicle_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "calls_twilio_call_sid_key" ON "public"."calls"("twilio_call_sid" ASC);

-- CreateIndex
CREATE INDEX "idx_calls_contact_started" ON "public"."calls"("contact_id" ASC, "started_at" ASC);

-- CreateIndex
CREATE INDEX "idx_calls_sid" ON "public"."calls"("twilio_call_sid" ASC);

-- CreateIndex
CREATE INDEX "checklist_templates_stage_idx" ON "public"."checklist_templates"("stage" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_stage_name_key" ON "public"."checklist_templates"("stage" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "connected_instagram_accounts_connected_by_id_idx" ON "public"."connected_instagram_accounts"("connected_by_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "connected_instagram_accounts_ig_user_id_key" ON "public"."connected_instagram_accounts"("ig_user_id" ASC);

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "public"."contacts"("email" ASC);

-- CreateIndex
CREATE INDEX "contacts_phone_idx" ON "public"."contacts"("phone" ASC);

-- CreateIndex
CREATE INDEX "disposition_logs_opportunity_id_idx" ON "public"."disposition_logs"("opportunity_id" ASC);

-- CreateIndex
CREATE INDEX "disposition_logs_user_id_idx" ON "public"."disposition_logs"("user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_dsr_disposition" ON "public"."disposition_stage_rules"("disposition_id" ASC);

-- CreateIndex
CREATE INDEX "idx_dsr_pipeline" ON "public"."disposition_stage_rules"("pipeline_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "email_subscriptions_subscription_id_key" ON "public"."email_subscriptions"("subscription_id" ASC);

-- CreateIndex
CREATE INDEX "idx_email_sub_email" ON "public"."email_subscriptions"("user_email" ASC);

-- CreateIndex
CREATE INDEX "idx_email_sub_expires" ON "public"."email_subscriptions"("expires_at" ASC);

-- CreateIndex
CREATE INDEX "event_sections_event_id_idx" ON "public"."event_sections"("event_id" ASC);

-- CreateIndex
CREATE INDEX "event_tasks_assignee_id_idx" ON "public"."event_tasks"("assignee_id" ASC);

-- CreateIndex
CREATE INDEX "event_tasks_section_id_idx" ON "public"."event_tasks"("section_id" ASC);

-- CreateIndex
CREATE INDEX "event_tasks_status_idx" ON "public"."event_tasks"("status" ASC);

-- CreateIndex
CREATE INDEX "events_date_idx" ON "public"."events"("date" ASC);

-- CreateIndex
CREATE INDEX "events_status_idx" ON "public"."events"("status" ASC);

-- CreateIndex
CREATE INDEX "external_repairs_status_idx" ON "public"."external_repairs"("status" ASC);

-- CreateIndex
CREATE INDEX "inventory_vehicles_make_model_idx" ON "public"."inventory_vehicles"("make" ASC, "model" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_vehicles_stock_number_key" ON "public"."inventory_vehicles"("stock_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_key_key" ON "public"."lead_sources"("key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_name_key" ON "public"."lead_sources"("name" ASC);

-- CreateIndex
CREATE INDEX "messages_contact_id_created_at_idx" ON "public"."messages"("contact_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "messages_external_id_idx" ON "public"."messages"("external_id" ASC);

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "public"."notifications"("user_id" ASC, "is_read" ASC);

-- CreateIndex
CREATE INDEX "opportunities_assignee_id_idx" ON "public"."opportunities"("assignee_id" ASC);

-- CreateIndex
CREATE INDEX "opportunities_contact_id_idx" ON "public"."opportunities"("contact_id" ASC);

-- CreateIndex
CREATE INDEX "opportunities_pipeline_id_stage_id_idx" ON "public"."opportunities"("pipeline_id" ASC, "stage_id" ASC);

-- CreateIndex
CREATE INDEX "opportunities_vehicle_id_idx" ON "public"."opportunities"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "opportunity_notes_opportunity_id_idx" ON "public"."opportunity_notes"("opportunity_id" ASC);

-- CreateIndex
CREATE INDEX "opportunity_tasks_assignee_id_idx" ON "public"."opportunity_tasks"("assignee_id" ASC);

-- CreateIndex
CREATE INDEX "opportunity_tasks_opportunity_id_idx" ON "public"."opportunity_tasks"("opportunity_id" ASC);

-- CreateIndex
CREATE INDEX "parts_assigned_to_id_idx" ON "public"."parts"("assigned_to_id" ASC);

-- CreateIndex
CREATE INDEX "parts_requested_by_id_idx" ON "public"."parts"("requested_by_id" ASC);

-- CreateIndex
CREATE INDEX "parts_source_stage_id_idx" ON "public"."parts"("source_stage_id" ASC);

-- CreateIndex
CREATE INDEX "parts_status_idx" ON "public"."parts"("status" ASC);

-- CreateIndex
CREATE INDEX "parts_vehicle_id_idx" ON "public"."parts"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_idx" ON "public"."pipeline_stages"("pipeline_id" ASC);

-- CreateIndex
CREATE INDEX "porter_entries_date_idx" ON "public"."porter_entries"("date" ASC);

-- CreateIndex
CREATE INDEX "porter_entries_porter_id_idx" ON "public"."porter_entries"("porter_id" ASC);

-- CreateIndex
CREATE INDEX "porter_tasks_assigned_to_id_idx" ON "public"."porter_tasks"("assigned_to_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "round_robin_state_pipeline_id_key" ON "public"."round_robin_state"("pipeline_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "round_robin_weights_pipeline_id_user_id_key" ON "public"."round_robin_weights"("pipeline_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "stage_config_stage_key" ON "public"."stage_config"("stage" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "stage_templates_stage_name_key" ON "public"."stage_templates"("stage" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "tasks_board_assignee_id_idx" ON "public"."tasks_board"("assignee_id" ASC);

-- CreateIndex
CREATE INDEX "tasks_board_status_idx" ON "public"."tasks_board"("status" ASC);

-- CreateIndex
CREATE INDEX "transport_requests_requested_by_idx" ON "public"."transport_requests"("requested_by" ASC);

-- CreateIndex
CREATE INDEX "transport_requests_status_idx" ON "public"."transport_requests"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_upload_links_contact" ON "public"."upload_links"("contact_id" ASC);

-- CreateIndex
CREATE INDEX "idx_upload_links_token" ON "public"."upload_links"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "upload_links_token_key" ON "public"."upload_links"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "public"."users"("clerk_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX "vehicle_interests_contact_id_idx" ON "public"."vehicle_interests"("contact_id" ASC);

-- CreateIndex
CREATE INDEX "vehicle_interests_make_model_idx" ON "public"."vehicle_interests"("make" ASC, "model" ASC);

-- CreateIndex
CREATE INDEX "vehicle_stages_assignee_id_idx" ON "public"."vehicle_stages"("assignee_id" ASC);

-- CreateIndex
CREATE INDEX "vehicle_stages_stage_status_idx" ON "public"."vehicle_stages"("stage" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "vehicle_stages_vehicle_id_idx" ON "public"."vehicle_stages"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "vehicles_current_assignee_id_idx" ON "public"."vehicles"("current_assignee_id" ASC);

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "public"."vehicles"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_stock_number_key" ON "public"."vehicles"("stock_number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "public"."vendors"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_plan_snapshots_week_start_key" ON "public"."weekly_plan_snapshots"("week_start" ASC);

-- AddForeignKey
ALTER TABLE "public"."activity_events" ADD CONSTRAINT "activity_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_events" ADD CONSTRAINT "activity_events_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_log" ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calendar_assignees" ADD CONSTRAINT "calendar_assignees_calendar_item_id_fkey" FOREIGN KEY ("calendar_item_id") REFERENCES "public"."calendar_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calendar_assignees" ADD CONSTRAINT "calendar_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calendar_items" ADD CONSTRAINT "calendar_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calendar_items" ADD CONSTRAINT "calendar_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calendar_items" ADD CONSTRAINT "calendar_items_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."calls" ADD CONSTRAINT "calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."calls" ADD CONSTRAINT "calls_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."connected_instagram_accounts" ADD CONSTRAINT "connected_instagram_accounts_connected_by_id_fkey" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."contacts" ADD CONSTRAINT "contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."disposition_logs" ADD CONSTRAINT "disposition_logs_disposition_id_fkey" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."disposition_logs" ADD CONSTRAINT "disposition_logs_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."disposition_logs" ADD CONSTRAINT "disposition_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_disposition_id_fkey" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_move_to_stage_id_fkey" FOREIGN KEY ("move_to_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."dispositions" ADD CONSTRAINT "dispositions_move_to_stage_id_fkey" FOREIGN KEY ("move_to_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dispositions" ADD CONSTRAINT "dispositions_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."email_subscriptions" ADD CONSTRAINT "email_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."event_sections" ADD CONSTRAINT "event_sections_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_tasks" ADD CONSTRAINT "event_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."event_tasks" ADD CONSTRAINT "event_tasks_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."event_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."events" ADD CONSTRAINT "events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."external_repairs" ADD CONSTRAINT "external_repairs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunities" ADD CONSTRAINT "opportunities_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunities" ADD CONSTRAINT "opportunities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunities" ADD CONSTRAINT "opportunities_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunities" ADD CONSTRAINT "opportunities_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunity_notes" ADD CONSTRAINT "opportunity_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunity_notes" ADD CONSTRAINT "opportunity_notes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."parts" ADD CONSTRAINT "parts_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."parts" ADD CONSTRAINT "parts_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."parts" ADD CONSTRAINT "parts_source_stage_id_fkey" FOREIGN KEY ("source_stage_id") REFERENCES "public"."vehicle_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."parts" ADD CONSTRAINT "parts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."porter_entries" ADD CONSTRAINT "porter_entries_porter_id_fkey" FOREIGN KEY ("porter_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."porter_tasks" ADD CONSTRAINT "porter_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."porter_tasks" ADD CONSTRAINT "porter_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."round_robin_weights" ADD CONSTRAINT "round_robin_weights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_approvals" ADD CONSTRAINT "task_approvals_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_approvals" ADD CONSTRAINT "task_approvals_vehicle_stage_id_fkey" FOREIGN KEY ("vehicle_stage_id") REFERENCES "public"."vehicle_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tasks_board" ADD CONSTRAINT "tasks_board_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tasks_board" ADD CONSTRAINT "tasks_board_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transport_requests" ADD CONSTRAINT "transport_requests_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transport_requests" ADD CONSTRAINT "transport_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transport_requests" ADD CONSTRAINT "transport_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."upload_links" ADD CONSTRAINT "upload_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."upload_links" ADD CONSTRAINT "upload_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."vehicle_interests" ADD CONSTRAINT "vehicle_interests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_interests" ADD CONSTRAINT "vehicle_interests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_stages" ADD CONSTRAINT "vehicle_stages_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_stages" ADD CONSTRAINT "vehicle_stages_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_current_assignee_id_fkey" FOREIGN KEY ("current_assignee_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


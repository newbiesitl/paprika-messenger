import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, primaryKey, foreignKey, unique, check } from 'drizzle-orm/sqlite-core';
const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
export const boards = sqliteTable('boards', {
  id:text('id').primaryKey(),label:text('label'),description:text('description').notNull().default('')
},t=>[check('board_id_length',sql`length(${t.id}) BETWEEN 1 AND 64`)]);
export const participants=sqliteTable('participants',{
  board:text('board').notNull().references(()=>boards.id),id:text('id').notNull(),label:text('label').notNull(),kind:text('kind').notNull(),
  thread_id:text('thread_id'),registered_by:text('registered_by').notNull(),created_at:text('created_at').notNull().default(now)
},t=>[primaryKey({columns:[t.board,t.id]}),check('participant_id_length',sql`length(${t.id}) BETWEEN 1 AND 96`),check('participant_label_length',sql`length(${t.label}) BETWEEN 1 AND 120`),check('participant_kind',sql`${t.kind} IN ('human','agent','thread')`),check('participant_thread_length',sql`length(${t.thread_id}) <= 160`)]);
export const messages=sqliteTable('messages',{
  id:text('id').primaryKey(),board:text('board').notNull().references(()=>boards.id),sender_id:text('sender_id').notNull(),sender_label:text('sender_label').notNull(),
  receiver_id:text('receiver_id').notNull(),topic:text('topic').notNull(),body:text('body').notNull(),reply_to_id:text('reply_to_id'),authored_by:text('authored_by').notNull(),
  idempotency_key:text('idempotency_key'),fingerprint:text('fingerprint').notNull(),deleted_at:text('deleted_at'),deleted_by:text('deleted_by'),created_at:text('created_at').notNull().default(now),updated_at:text('updated_at').notNull().default(now)
},t=>[unique('message_board_id').on(t.board,t.id),unique('message_idempotency').on(t.board,t.authored_by,t.sender_id,t.idempotency_key),
  foreignKey({columns:[t.board,t.sender_id],foreignColumns:[participants.board,participants.id]}),foreignKey({columns:[t.board,t.receiver_id],foreignColumns:[participants.board,participants.id]}),
  foreignKey({columns:[t.board,t.reply_to_id],foreignColumns:[messages.board,messages.id]}),
  index('message_inbox').on(t.board,t.receiver_id,t.deleted_at),index('message_replies').on(t.board,t.reply_to_id),
  check('message_sender_label_length',sql`length(${t.sender_label}) BETWEEN 1 AND 120`),check('message_topic_length',sql`length(${t.topic}) BETWEEN 1 AND 120`),check('message_body_length',sql`length(${t.body}) BETWEEN 1 AND 16000`),check('message_idempotency_length',sql`length(${t.idempotency_key}) BETWEEN 1 AND 128`)]);
export const recipientMetadata=sqliteTable('recipient_metadata',{
  board:text('board').notNull(),participant_id:text('participant_id').notNull(),title:text('title'),search_name:text('search_name').notNull().default(''),
  source:text('source').notNull().default('unknown'),execution_mode:text('execution_mode').notNull().default('unknown'),
  host_id:text('host_id'),workspace_name:text('workspace_name'),project_status:text('project_status').notNull().default('unknown'),
  project_id:text('project_id'),project_name:text('project_name'),project_observed_at:text('project_observed_at'),observed_at:text('observed_at').notNull()
},t=>[primaryKey({columns:[t.board,t.participant_id]}),foreignKey({columns:[t.board,t.participant_id],foreignColumns:[participants.board,participants.id]}),
  check('recipient_source',sql`${t.source} IN ('chatgpt','codex','dot','unknown')`),
  check('recipient_execution_mode',sql`${t.execution_mode} IN ('local','cloud','unknown')`),
  check('recipient_project_status',sql`${t.project_status} IN ('assigned','unassigned','unknown')`)]);
export const recipientConversations=sqliteTable('recipient_conversations',{
  board:text('board').notNull(),participant_id:text('participant_id').notNull(),registered_thread_id:text('registered_thread_id').notNull(),
  conversation_id:text('conversation_id').notNull(),revision:integer('revision').notNull(),observed_at:text('observed_at').notNull()
},t=>[primaryKey({columns:[t.board,t.participant_id]}),foreignKey({columns:[t.board,t.participant_id],foreignColumns:[participants.board,participants.id]}),
  unique('recipient_conversation_address').on(t.board,t.conversation_id),check('recipient_conversation_revision',sql`${t.revision} > 0`)]);
export const recipientActivity=sqliteTable('recipient_activity',{
  board:text('board').notNull(),participant_id:text('participant_id').notNull(),activity_sequence:integer('activity_sequence').notNull(),last_communicated_at:text('last_communicated_at').notNull()
},t=>[primaryKey({columns:[t.board,t.participant_id]}),foreignKey({columns:[t.board,t.participant_id],foreignColumns:[participants.board,participants.id]}),
  index('recipient_recent').on(t.board,t.last_communicated_at,t.participant_id)]);
export const acknowledgments=sqliteTable('acknowledgments',{
  board:text('board').notNull(),message_id:text('message_id').notNull(),participant_id:text('participant_id').notNull(),acknowledged_by:text('acknowledged_by').notNull(),acknowledged_at:text('acknowledged_at').notNull().default(now)
},t=>[primaryKey({columns:[t.board,t.message_id,t.participant_id]}),foreignKey({columns:[t.board,t.message_id],foreignColumns:[messages.board,messages.id]}),foreignKey({columns:[t.board,t.participant_id],foreignColumns:[participants.board,participants.id]})]);
export const coordination=sqliteTable('coordination',{
  title:text('title').notNull().default('Coordination'),body:text('body'),
  board:text('board').primaryKey().references(()=>boards.id),queue_reference:text('queue_reference').notNull().default('Not agreed'),execution_owner:text('execution_owner').notNull().default('Unassigned'),launch_status:text('launch_status').notNull().default('HOLD'),reported_clock:text('reported_clock'),revision:integer('revision').notNull().default(0),last_confirmed_at:text('last_confirmed_at'),confirmed_by:text('confirmed_by')
},t=>[check('coordination_status',sql`${t.launch_status} IN ('HOLD','RELEASE')`)]);
export const events=sqliteTable('events',{
  sequence:integer('sequence').primaryKey({autoIncrement:true}),board:text('board').notNull().references(()=>boards.id),kind:text('kind').notNull(),entity_id:text('entity_id').notNull(),receiver_id:text('receiver_id'),topic:text('topic'),payload:text('payload').notNull(),occurred_at:text('occurred_at').notNull().default(now)
},t=>[check('event_payload_json',sql`json_valid(${t.payload})`),index('event_feed').on(t.board,t.sequence),index('event_message').on(t.board,t.entity_id,t.sequence)]);
export const eventSubscriptions=sqliteTable('event_subscriptions',{
  id:text('id').primaryKey(),board:text('board').notNull().references(()=>boards.id),receiver_id:text('receiver_id').notNull(),
  owner_subject:text('owner_subject').notNull(),owner_email:text('owner_email'),event_name:text('event_name').notNull(),arguments_json:text('arguments_json').notNull(),callback_url:text('callback_url').notNull(),
  secret_box:text('secret_box').notNull(),previous_secret_box:text('previous_secret_box'),rotate_until:integer('rotate_until').notNull().default(0),
  expires_at:integer('expires_at').notNull(),active:integer('active').notNull().default(1),paused:integer('paused').notNull().default(0),notification_mode:text('notification_mode').notNull().default('notify_only'),
  wake_limit:integer('wake_limit').notNull().default(30),window_start:integer('window_start').notNull(),wake_count:integer('wake_count').notNull().default(0),verified_at:integer('verified_at').notNull(),scanned_sequence:integer('scanned_sequence').notNull(),created_at:integer('created_at').notNull()
},t=>[foreignKey({columns:[t.board,t.receiver_id],foreignColumns:[participants.board,participants.id]}),index('event_subscription_owner').on(t.owner_subject,t.board),check('event_subscription_active',sql`${t.active} IN (0,1)`),check('event_subscription_paused',sql`${t.paused} IN (0,1)`),check('event_subscription_mode',sql`${t.notification_mode} IN ('notify_only','process_inbox')`),check('event_subscription_budget',sql`${t.wake_limit} BETWEEN 1 AND 100`)]);
export const eventDeliveries=sqliteTable('event_deliveries',{
  subscription_id:text('subscription_id').notNull().references(()=>eventSubscriptions.id),event_sequence:integer('event_sequence').notNull().references(()=>events.sequence),event_id:text('event_id').notNull(),
  state:text('state').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),next_attempt:integer('next_attempt').notNull(),lease_token:text('lease_token'),lease_until:integer('lease_until').notNull().default(0),
  http_status:integer('http_status'),last_error:text('last_error'),accepted_at:integer('accepted_at'),created_at:integer('created_at').notNull()
},t=>[primaryKey({columns:[t.subscription_id,t.event_sequence]}),index('event_delivery_due').on(t.state,t.next_attempt,t.lease_until),check('event_delivery_state',sql`${t.state} IN ('pending','accepted','failed','cancelled')`)]);

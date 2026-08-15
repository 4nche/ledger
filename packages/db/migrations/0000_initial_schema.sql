CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"account_type" varchar(20) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"starting_balance" numeric(24, 8) NOT NULL,
	"external_account_id" varchar(200),
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_check" CHECK ("accounts"."provider" in ('MANUAL', 'FTMO', 'THE5ERS', 'BYBIT', 'BINANCE', 'HYPERLIQUID', 'OTHER')),
	CONSTRAINT "accounts_account_type_check" CHECK ("accounts"."account_type" in ('PERSONAL', 'PROP_CHALLENGE', 'PROP_FUNDED', 'PAPER')),
	CONSTRAINT "accounts_currency_check" CHECK ("accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "accounts_starting_balance_check" CHECK ("accounts"."starting_balance" > 0)
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"symbol" varchar(40) NOT NULL,
	"market_type" varchar(20) NOT NULL,
	"side" varchar(10) NOT NULL,
	"initial_stop_price" numeric(30, 12),
	"notes" text,
	"status" varchar(10) NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"entry_quantity" numeric(30, 12) NOT NULL,
	"exit_quantity" numeric(30, 12) NOT NULL,
	"open_quantity" numeric(30, 12) GENERATED ALWAYS AS (entry_quantity - exit_quantity) STORED,
	"average_entry_price" numeric(30, 12) NOT NULL,
	"average_exit_price" numeric(30, 12),
	"initial_risk_amount" numeric(24, 8),
	"initial_risk_pct" numeric(16, 8),
	"realized_pnl" numeric(24, 8) NOT NULL,
	"realized_pnl_pct" numeric(16, 8) NOT NULL,
	"r_multiple" numeric(16, 8),
	"fees" numeric(24, 8) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_market_type_check" CHECK ("positions"."market_type" in ('SPOT', 'PERPETUAL', 'FUTURES')),
	CONSTRAINT "positions_side_check" CHECK ("positions"."side" in ('LONG', 'SHORT')),
	CONSTRAINT "positions_status_check" CHECK ("positions"."status" in ('OPEN', 'CLOSED')),
	CONSTRAINT "positions_entry_quantity_check" CHECK ("positions"."entry_quantity" >= 0),
	CONSTRAINT "positions_exit_quantity_check" CHECK ("positions"."exit_quantity" >= 0),
	CONSTRAINT "positions_exit_not_over_entry_check" CHECK ("positions"."exit_quantity" <= "positions"."entry_quantity"),
	CONSTRAINT "positions_initial_stop_check" CHECK ("positions"."initial_stop_price" is null or "positions"."initial_stop_price" > 0),
	CONSTRAINT "positions_closed_at_check" CHECK (("positions"."status" = 'CLOSED') = ("positions"."closed_at" is not null)),
	CONSTRAINT "positions_closed_quantity_check" CHECK ("positions"."status" <> 'CLOSED' or "positions"."exit_quantity" = "positions"."entry_quantity"),
	CONSTRAINT "positions_r_multiple_check" CHECK (("positions"."initial_risk_amount" is not null) = ("positions"."r_multiple" is not null))
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"type" varchar(10) NOT NULL,
	"price" numeric(30, 12) NOT NULL,
	"quantity" numeric(30, 12) NOT NULL,
	"fee" numeric(24, 8) DEFAULT '0' NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"external_trade_id" varchar(200),
	"notes" text,
	"realized_pnl" numeric(24, 8),
	"realized_pnl_pct" numeric(16, 8),
	"r_multiple" numeric(16, 8),
	"average_entry_price" numeric(30, 12),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_type_check" CHECK ("trades"."type" in ('ENTRY', 'EXIT')),
	CONSTRAINT "trades_price_check" CHECK ("trades"."price" > 0),
	CONSTRAINT "trades_quantity_check" CHECK ("trades"."quantity" > 0),
	CONSTRAINT "trades_fee_check" CHECK ("trades"."fee" >= 0),
	CONSTRAINT "trades_realized_pnl_check" CHECK (("trades"."type" = 'EXIT') = ("trades"."realized_pnl" is not null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "positions_account_id_idx" ON "positions" USING btree ("account_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "positions_symbol_idx" ON "positions" USING btree ("symbol") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "positions_opened_at_idx" ON "positions" USING btree ("opened_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "positions_closed_at_idx" ON "positions" USING btree ("closed_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "positions_account_opened_at_idx" ON "positions" USING btree ("account_id","opened_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "positions_account_closed_at_idx" ON "positions" USING btree ("account_id","closed_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "positions_symbol_closed_at_idx" ON "positions" USING btree ("symbol","closed_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "positions_open_idx" ON "positions" USING btree ("account_id") WHERE status = 'OPEN' and deleted_at is null;--> statement-breakpoint
CREATE INDEX "trades_position_id_idx" ON "trades" USING btree ("position_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "trades_executed_at_idx" ON "trades" USING btree ("executed_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "trades_position_executed_at_idx" ON "trades" USING btree ("position_id","executed_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "trades_exit_executed_at_idx" ON "trades" USING btree ("executed_at") WHERE type = 'EXIT' and deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "trades_position_external_id_unique" ON "trades" USING btree ("position_id","external_trade_id") WHERE external_trade_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
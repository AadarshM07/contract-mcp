import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nitrostack/core';
import { createClient, ClickHouseClient } from '@clickhouse/client';

@Injectable()
export class ClickHouseService implements OnModuleInit, OnApplicationShutdown {
    private client!: ClickHouseClient;

    async onModuleInit() {
        const host = process.env.CLICKHOUSE_HOST;
        const username = process.env.CLICKHOUSE_USER || 'default';
        const password = process.env.CLICKHOUSE_PASSWORD || '';
        const database = process.env.CLICKHOUSE_DATABASE || 'default';

        if (!host) throw new Error('CLICKHOUSE_HOST environment variable is not defined');

        this.client = createClient({ url: host, username, password, database });

        await this.initSchema();
        console.error('[ClickHouseService] Connected and schema initialized.');
    }

    async onApplicationShutdown() {
        await this.client?.close();
        console.error('[ClickHouseService] ClickHouse connection closed.');
    }

    private async initSchema() {
        await this.client.exec({
            query: `
                CREATE TABLE IF NOT EXISTS vendors (
                    vendor_id     String,
                    name          String,
                    email         String,
                    phone         String,
                    category      String,
                    address       String,
                    contact_person String,
                    status        String,
                    created_at    DateTime DEFAULT now()
                ) ENGINE = MergeTree()
                ORDER BY (vendor_id, created_at)
            `,
        });

        await this.client.exec({
            query: `
                CREATE TABLE IF NOT EXISTS contracts (
                    contract_id   String,
                    vendor_id     String,
                    title         String,
                    description   String,
                    value         Float64,
                    currency      String,
                    start_date    Date,
                    end_date      Date,
                    status        String,
                    created_at    DateTime DEFAULT now()
                ) ENGINE = MergeTree()
                ORDER BY (contract_id, vendor_id, created_at)
            `,
        });

        await this.client.exec({
            query: `
                CREATE TABLE IF NOT EXISTS contract_events (
                    event_id      String,
                    contract_id   String,
                    vendor_id     String,
                    event_type    String,
                    event_data    String,
                    actor         String,
                    event_time    DateTime DEFAULT now()
                ) ENGINE = MergeTree()
                ORDER BY (contract_id, event_time)
                PARTITION BY toYYYYMM(event_time)
            `,
        });

        await this.client.exec({
            query: `
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    session_id   String,
                    flow         String,
                    step         String,
                    answers      String,
                    contract_id  String,
                    updated_at   DateTime DEFAULT now()
                ) ENGINE = ReplacingMergeTree(updated_at)
                ORDER BY session_id
            `,
        });
    }

    async insert<T extends object>(table: string, values: T[]): Promise<void> {
        await this.client.insert({ table, values, format: 'JSONEachRow' });
    }

    async query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
        const result = await this.client.query({
            query: sql,
            query_params: params,
            format: 'JSONEachRow',
        });
        return result.json<T>();
    }
}

import { Injectable } from '@nitrostack/core';
import { randomUUID } from 'crypto';
import { ClickHouseService } from './clickhouse.service.js';

export interface Vendor {
    vendor_id: string;
    name: string;
    email: string;
    phone: string;
    category: string;
    address: string;
    contact_person: string;
    status: string;
    created_at: string;
}

export interface Contract {
    contract_id: string;
    vendor_id: string;
    title: string;
    description: string;
    value: number;
    currency: string;
    start_date: string;
    end_date: string;
    status: string;
    created_at: string;
}

export type SessionFlow = 'register_vendor' | 'create_contract' | 'update_contract';
export type SessionStep =
    | 'vendor_name' | 'vendor_email' | 'vendor_phone' | 'vendor_category'
    | 'vendor_address' | 'vendor_contact_person'
    | 'contract_vendor_id' | 'contract_title' | 'contract_description'
    | 'contract_value' | 'contract_currency' | 'contract_start_date' | 'contract_end_date';

export interface ChatSession {
    session_id: string;
    flow: SessionFlow;
    step: SessionStep;
    answers: Record<string, string | number>;
    contract_id: string;
}

@Injectable({ deps: [ClickHouseService] })
export class VendorService {
    constructor(private readonly db: ClickHouseService) {}


    async registerVendor(data: {
        name: string;
        email: string;
        phone: string;
        category: string;
        address: string;
        contact_person: string;
    }): Promise<Vendor> {
        const vendor: Vendor = {
            vendor_id: randomUUID(),
            status: 'active',
            created_at: new Date().toISOString(),
            ...data,
        };
        await this.db.insert('vendors', [vendor]);
        return vendor;
    }


    async createContract(data: {
        vendor_id: string;
        title: string;
        description: string;
        value: number;
        currency: string;
        start_date: string;
        end_date: string;
    }): Promise<Contract> {
        const contract: Contract = {
            contract_id: randomUUID(),
            status: 'draft',
            created_at: new Date().toISOString(),
            ...data,
        };
        await this.db.insert('contracts', [contract]);
        await this.insertEvent(contract.contract_id, contract.vendor_id, 'CONTRACT_CREATED', data, 'vendor');
        return contract;
    }

    async updateContract(contract_id: string, updates: {
        title?: string;
        description?: string;
        value?: number;
        currency?: string;
        start_date?: string;
        end_date?: string;
    }): Promise<Contract> {
        const existing = await this.getContractById(contract_id);
        if (!existing) throw new Error(`Contract not found: ${contract_id}`);

        const updated: Contract = { ...existing, ...updates };
        await this.db.insert('contracts', [updated]);
        await this.insertEvent(contract_id, existing.vendor_id, 'CONTRACT_UPDATED', updates, 'vendor');
        return updated;
    }

    async getContractById(contract_id: string): Promise<Contract | null> {
        const rows = await this.db.query<Contract>(
            `SELECT * FROM contracts WHERE contract_id = {contract_id:String} ORDER BY created_at DESC LIMIT 1`,
            { contract_id }
        );
        return rows[0] ?? null;
    }

    async searchContracts(query: string, vendor_id?: string, limit = 20): Promise<Contract[]> {
        let sql = `SELECT * FROM contracts WHERE (title ILIKE {q:String} OR description ILIKE {q:String})`;
        const params: Record<string, unknown> = { q: `%${query}%`, limit };
        if (vendor_id) {
            sql += ` AND vendor_id = {vendor_id:String}`;
            params.vendor_id = vendor_id;
        }
        sql += ` ORDER BY created_at DESC LIMIT {limit:UInt32}`;
        return this.db.query<Contract>(sql, params);
    }


    async submitForApproval(contract_id: string): Promise<Contract> {
        const existing = await this.getContractById(contract_id);
        if (!existing) throw new Error(`Contract not found: ${contract_id}`);
        if (existing.status !== 'draft') {
            throw new Error(`Contract must be in 'draft' status to submit. Current: ${existing.status}`);
        }
        const updated: Contract = { ...existing, status: 'pending_approval' };
        await this.db.insert('contracts', [updated]);
        await this.insertEvent(contract_id, existing.vendor_id, 'CONTRACT_SUBMITTED', { status: 'pending_approval' }, 'vendor');
        return updated;
    }


    // ─── Session Management ───────────────────────────────────────────────────

    async createSession(flow: SessionFlow, firstStep: SessionStep, contract_id?: string): Promise<ChatSession> {
        const session: ChatSession = {
            session_id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            flow,
            step: firstStep,
            answers: {},
            contract_id: contract_id ?? '',
        };
        await this.db.insert('chat_sessions', [{
            session_id: session.session_id,
            flow: session.flow,
            step: session.step,
            answers: JSON.stringify(session.answers),
            contract_id: session.contract_id,
            updated_at: new Date().toISOString(),
        }]);
        return session;
    }

    async loadSession(session_id: string): Promise<ChatSession | null> {
        // FINAL forces ClickHouse to collapse ReplacingMergeTree duplicates at query time
        const rows = await this.db.query<{
            session_id: string;
            flow: string;
            step: string;
            answers: string;
            contract_id: string;
        }>(
            `SELECT session_id, flow, step, answers, contract_id
             FROM chat_sessions FINAL
             WHERE session_id = {session_id:String}`,
            { session_id }
        );
        if (!rows[0] || rows[0].flow === '__deleted__') return null;
        const row = rows[0];
        return {
            session_id: row.session_id,
            flow: row.flow as SessionFlow,
            step: row.step as SessionStep,
            answers: JSON.parse(row.answers),
            contract_id: row.contract_id,
        };
    }

    async saveSession(session: ChatSession): Promise<void> {
        await this.db.insert('chat_sessions', [{
            session_id: session.session_id,
            flow: session.flow,
            step: session.step,
            answers: JSON.stringify(session.answers),
            contract_id: session.contract_id,
            updated_at: new Date().toISOString(),
        }]);
    }

    async deleteSession(session_id: string): Promise<void> {
        // ClickHouse MergeTree doesn't support row-level deletes natively;
        // we mark it deleted by writing a tombstone with a sentinel flow value.
        await this.db.insert('chat_sessions', [{
            session_id,
            flow: '__deleted__',
            step: '',
            answers: '{}',
            contract_id: '',
            updated_at: new Date().toISOString(),
        }]);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    private async insertEvent(
        contract_id: string,
        vendor_id: string,
        event_type: string,
        event_data: unknown,
        actor: string
    ) {
        await this.db.insert('contract_events', [{
            event_id: randomUUID(),
            contract_id,
            vendor_id,
            event_type,
            event_data: JSON.stringify(event_data),
            actor,
            event_time: new Date().toISOString(),
        }]);
    }
}

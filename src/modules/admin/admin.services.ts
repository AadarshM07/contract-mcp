import { Injectable } from '@nitrostack/core';
import { randomUUID } from 'crypto';
import { ClickHouseService } from '../vendor/clickhouse.service.js';

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

export interface ContractEvent {
    event_id: string;
    contract_id: string;
    vendor_id: string;
    event_type: string;
    event_data: string;
    actor: string;
    event_time: string;
}

export interface ContractFilterOptions {
    status?: string;
    vendor_id?: string;
    query?: string;
    limit?: number;
}

@Injectable({ deps: [ClickHouseService] })
export class AdminService {
    constructor(private readonly db: ClickHouseService) {}

    private async insertEvent(
        contract_id: string,
        vendor_id: string,
        event_type: string,
        event_data: unknown,
        actor = 'admin'
    ): Promise<void> {
        await this.db.insert('contract_events', [
            {
                event_id: randomUUID(),
                contract_id,
                vendor_id,
                event_type,
                event_data: JSON.stringify(event_data),
                actor,
                event_time: new Date().toISOString(),
            },
        ]);
    }

    async approveContract(contract_id: string, notes?: string) {
        const rows = await this.db.query<Contract>(
            `SELECT * FROM contracts WHERE contract_id = {contract_id:String} ORDER BY created_at DESC LIMIT 1`,
            { contract_id }
        );

        if (rows.length === 0) {
            return { success: false, message: 'Contract not found' };
        }
        const contract = rows[0];
        if (contract.status === 'approved') {
            return { success: false, message: 'Contract is already approved' };
        }
        if (contract.status === 'rejected') {
            return { success: false, message: 'Contract is already rejected' };
        }

        if (
            contract.status === 'pending_approval' ||
            contract.status === 'pending' ||
            contract.status === 'draft'
        ) {
            const updated: Contract = {
                ...contract,
                status: 'approved',
                created_at: new Date().toISOString(),
            };
            await this.db.insert('contracts', [updated]);
            await this.insertEvent(
                contract.contract_id,
                contract.vendor_id,
                'CONTRACT_APPROVED',
                { previous_status: contract.status, notes: notes ?? '' },
                'admin'
            );
            return { success: true, message: 'Contract approved successfully', contract: updated };
        }
        return { success: false, message: `Contract status '${contract.status}' cannot be approved` };
    }

    async rejectContract(contract_id: string, reason?: string) {
        const rows = await this.db.query<Contract>(
            `SELECT * FROM contracts WHERE contract_id = {contract_id:String} ORDER BY created_at DESC LIMIT 1`,
            { contract_id }
        );

        if (rows.length === 0) {
            return { success: false, message: 'Contract not found' };
        }
        const contract = rows[0];
        if (contract.status === 'rejected') {
            return { success: false, message: 'Contract is already rejected' };
        }

        if (
            contract.status === 'draft' ||
            contract.status === 'pending_approval' ||
            contract.status === 'pending' ||
            contract.status === 'approved'
        ) {
            const updated: Contract = {
                ...contract,
                status: 'rejected',
                created_at: new Date().toISOString(),
            };
            await this.db.insert('contracts', [updated]);
            await this.insertEvent(
                contract.contract_id,
                contract.vendor_id,
                'CONTRACT_REJECTED',
                { previous_status: contract.status, reason: reason ?? '' },
                'admin'
            );
            return { success: true, message: 'Contract rejected successfully', contract: updated };
        }
        return { success: false, message: `Contract status '${contract.status}' cannot be rejected` };
    }

    async getLatestContract() {
        const rows = await this.db.query<Contract>(
            `SELECT * FROM contracts ORDER BY created_at DESC LIMIT 1`
        );
        if (rows.length === 0) {
            return { success: false, message: 'No contracts found' };
        }
        return { success: true, contract: rows[0] };
    }


    async getPendingContracts(limit = 50) {
        const rows = await this.db.query<Contract>(
            `SELECT * FROM (
                SELECT * FROM contracts ORDER BY created_at DESC LIMIT 1 BY contract_id
            ) WHERE status IN ('pending_approval', 'pending')
            ORDER BY created_at DESC
            LIMIT {limit:UInt32}`,
            { limit }
        );
        return { success: true, count: rows.length, contracts: rows };
    }


    async getContractById(contract_id: string) {
        const rows = await this.db.query<Contract>(
            `SELECT * FROM contracts WHERE contract_id = {contract_id:String} ORDER BY created_at DESC LIMIT 1`,
            { contract_id }
        );
        if (rows.length === 0) {
            return { success: false, message: 'Contract not found' };
        }
        return { success: true, contract: rows[0] };
    }

    async getContractsByVendor(vendor_id: string, limit = 10) {
        const rows = await this.db.query<Contract>(
            `SELECT * FROM (
                SELECT * FROM contracts WHERE vendor_id = {vendor_id:String} ORDER BY created_at DESC LIMIT 1 BY contract_id
            ) ORDER BY created_at DESC LIMIT {limit:UInt32}`,
            { vendor_id, limit }
        );
        return { success: true, count: rows.length, contracts: rows };
    }


    async getAllVendors(limit = 50) {
        const rows = await this.db.query<Vendor>(
            `SELECT * FROM (
                SELECT * FROM vendors ORDER BY created_at DESC LIMIT 1 BY vendor_id
            ) ORDER BY created_at DESC LIMIT {limit:UInt32}`,
            { limit }
        );
        return { success: true, count: rows.length, vendors: rows };
    }

    async getAnalytics() {
        const events = await this.db.query<{ event_type: string; count: string }>(
            `SELECT event_type, count() AS count
             FROM contract_events
             GROUP BY event_type`
        );

        const counts: Record<string, number> = {};
        for (const row of events) {
            counts[row.event_type] = Number(row.count);
        }

        return {
            success: true,
            analytics: {
                vendors_registered: counts['VENDOR_REGISTERED'] ?? 0,
                contracts_created: counts['CONTRACT_CREATED'] ?? 0,
                contracts_submitted: counts['CONTRACT_SUBMITTED'] ?? 0,
                contracts_approved: counts['CONTRACT_APPROVED'] ?? 0,
                contracts_rejected: counts['CONTRACT_REJECTED'] ?? 0,
            },
        };
    }
}
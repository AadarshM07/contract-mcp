import { Injectable } from '@nitrostack/core';
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


@Injectable({ deps: [ClickHouseService] })
export class AdminService {
    constructor(private readonly db: ClickHouseService) {}
    
    async approveContract(contract_id: string) {
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
            return { success: false, message: 'Contract is rejected' };
        }
        
        if (contract.status === 'pending_approval' || contract.status === 'pending' || contract.status === 'draft') {
            const updated: Contract = {
                ...contract,
                status: 'approved',
                created_at: new Date().toISOString(),
            };
            await this.db.insert('contracts', [updated]);
            return { success: true, message: 'Contract approved', contract: updated };
        }    
        return { success: false, message: `Contract status '${contract.status}' cannot be approved` };
    }

    

    async rejectContract(contract_id: string) {
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
        
        if (contract.status === 'draft' || contract.status === 'pending_approval' || contract.status === 'pending' || contract.status === 'approved') {
            const updated: Contract = {
                ...contract,
                status: 'rejected',
                created_at: new Date().toISOString(),
            };
            await this.db.insert('contracts', [updated]);
            return { success: true, message: 'Contract rejected', contract: updated };
        }
        return { success: false, message: `Contract status '${contract.status}' cannot be rejected` };
    }
}
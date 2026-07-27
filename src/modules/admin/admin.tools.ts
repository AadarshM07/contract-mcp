import { ToolDecorator as Tool, ExecutionContext, Injectable, z } from '@nitrostack/core';
import { AdminService } from './admin.services.js';

const approveContract = z.object({
    contract_id: z.string().describe('ID of the contract'),
});

const rejectContract = z.object({
    contract_id: z.string().describe('ID of the contract'),
});


@Injectable({ deps: [AdminService] })
export class AdminTools {
    constructor(private readonly adminService: AdminService) {}

    @Tool({ name: 'approveContract', description: 'Approve a contract if the contract is in pending state', inputSchema: approveContract })
    async approveContract(input: z.infer<typeof approveContract>, ctx: ExecutionContext) {
        return this.adminService.approveContract(input.contract_id);
    }

    @Tool({ name: 'rejectContract', description: 'Reject a contract if the contract is in pending or approved state', inputSchema: rejectContract })
    async rejectContract(input: z.infer<typeof rejectContract>, ctx: ExecutionContext) {
        return this.adminService.rejectContract(input.contract_id);
    }
}
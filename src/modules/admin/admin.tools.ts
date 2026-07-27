import { ToolDecorator as Tool, ExecutionContext, Injectable, z } from '@nitrostack/core';
import { AdminService } from './admin.services.js';

const approveContractSchema = z.object({
    contract_id: z.string().describe('ID of the contract to approve'),
    notes: z.string().optional().describe('Optional approval notes or instructions'),
});

const rejectContractSchema = z.object({
    contract_id: z.string().describe('ID of the contract to reject'),
    reason: z.string().optional().describe('Reason for rejection'),
});

const contractIdSchema = z.object({
    contract_id: z.string().describe('ID of the contract'),
});

const getContractsByVendorSchema = z.object({
    vendor_id: z.string().describe('ID of the vendor'),
    limit: z.number().positive().optional().default(50).describe('Maximum number of contracts to return'),
});

const getPendingContractsSchema = z.object({
    limit: z.number().positive().optional().default(50).describe('Maximum number of pending contracts to return'),
});

const getAllVendorsSchema = z.object({
    limit: z.number().positive().optional().default(50).describe('Maximum number of vendors to return'),
});

const emptySchema = z.object({});

@Injectable({ deps: [AdminService] })
export class AdminTools {
    constructor(private readonly adminService: AdminService) {}

    @Tool({
        name: 'approveContract',
        description: 'Approve a pending contract. Updates contract status to approved and logs audit event.',
        inputSchema: approveContractSchema,
    })
    async approveContract(input: z.infer<typeof approveContractSchema>, ctx: ExecutionContext) {
        ctx.logger.info(`Admin approving contract ${input.contract_id}`);
        return this.adminService.approveContract(input.contract_id, input.notes);
    }

    @Tool({
        name: 'rejectContract',
        description: 'Reject a contract with an optional reason. Updates contract status to rejected and logs audit event.',
        inputSchema: rejectContractSchema,
    })
    async rejectContract(input: z.infer<typeof rejectContractSchema>, ctx: ExecutionContext) {
        ctx.logger.info(`Admin rejecting contract ${input.contract_id}`);
        return this.adminService.rejectContract(input.contract_id, input.reason);
    }

    @Tool({
        name: 'getLatestContract',
        description: 'Get details of the single most recently created or updated contract across the entire system.',
        inputSchema: emptySchema,
    })
    async getLatestContract(input: z.infer<typeof emptySchema>, ctx: ExecutionContext) {
        return this.adminService.getLatestContract();
    }

    @Tool({
        name: 'getContractById',
        description: 'Get comprehensive details of a specific contract by its contract_id.',
        inputSchema: contractIdSchema,
    })
    async getContractById(input: z.infer<typeof contractIdSchema>, ctx: ExecutionContext) {
        return this.adminService.getContractById(input.contract_id);
    }

    @Tool({
        name: 'getPendingContracts',
        description: 'Get all contracts currently waiting for admin approval.',
        inputSchema: getPendingContractsSchema,
    })
    async getPendingContracts(input: z.infer<typeof getPendingContractsSchema>, ctx: ExecutionContext) {
        return this.adminService.getPendingContracts(input.limit);
    }

    @Tool({
        name: 'getContractsByVendor',
        description: 'Get all contracts belonging to a specific vendor ID.',
        inputSchema: getContractsByVendorSchema,
    })
    async getContractsByVendor(input: z.infer<typeof getContractsByVendorSchema>, ctx: ExecutionContext) {
        return this.adminService.getContractsByVendor(input.vendor_id, input.limit);
    }

    @Tool({
        name: 'getAllVendors',
        description: 'Get list of all registered vendors and their details.',
        inputSchema: getAllVendorsSchema,
    })
    async getAllVendors(input: z.infer<typeof getAllVendorsSchema>, ctx: ExecutionContext) {
        return this.adminService.getAllVendors(input.limit);
    }

    @Tool({
        name: 'getAnalytics',
        description: 'Get system-wide analytics for the admin dashboard. Returns counts of vendors registered, contracts created, submitted, approved, and rejected — derived from the event log.',
        inputSchema: emptySchema,
    })
    async getAnalytics(input: z.infer<typeof emptySchema>, ctx: ExecutionContext) {
        return this.adminService.getAnalytics();
    }
}
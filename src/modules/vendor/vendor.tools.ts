import { ToolDecorator as Tool, ExecutionContext, Injectable, z } from '@nitrostack/core';
import { VendorService, ChatSession, SessionStep, SessionFlow } from './vendor.service.js';

const RegisterVendorSchema = z.object({
    name: z.string().describe('Legal name of the vendor company'),
    email: z.string().email().describe('Primary contact email'),
    phone: z.string().describe('Contact phone number'),
    category: z.string().describe('Vendor category e.g. Software, Logistics, Consulting'),
    address: z.string().describe('Registered business address'),
    contact_person: z.string().describe('Primary contact person full name'),
});

const CreateContractSchema = z.object({
    vendor_id: z.string().describe('ID of the vendor this contract belongs to'),
    title: z.string().describe('Contract title / subject'),
    description: z.string().describe('Detailed description of the contract scope'),
    value: z.number().positive().describe('Contract monetary value'),
    currency: z.string().default('USD').describe('Currency code e.g. USD, EUR'),
    start_date: z.string().describe('Contract start date (YYYY-MM-DD)'),
    end_date: z.string().describe('Contract end date (YYYY-MM-DD)'),
});

const UpdateContractSchema = z.object({
    contract_id: z.string().describe('ID of the contract to update'),
    title: z.string().optional().describe('Updated title'),
    description: z.string().optional().describe('Updated description'),
    value: z.number().positive().optional().describe('Updated monetary value'),
    currency: z.string().optional().describe('Updated currency code'),
    start_date: z.string().optional().describe('Updated start date (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('Updated end date (YYYY-MM-DD)'),
});

const ContractIdSchema = z.object({
    contract_id: z.string().describe('ID of the contract'),
});



const VENDOR_STEPS: SessionStep[] = [
    'vendor_name', 'vendor_email', 'vendor_phone',
    'vendor_category', 'vendor_address', 'vendor_contact_person',
];

const CONTRACT_STEPS: SessionStep[] = [
    'contract_vendor_id', 'contract_title', 'contract_description',
    'contract_value', 'contract_currency', 'contract_start_date', 'contract_end_date',
];

const STEP_QUESTIONS: Record<SessionStep, string> = {
    vendor_name: "What is the legal name of the vendor company?",
    vendor_email: "What is the vendor's primary contact email?",
    vendor_phone: "What is the vendor's contact phone number?",
    vendor_category: "What category does this vendor fall under? (e.g. Software, Logistics, Consulting)",
    vendor_address: "What is the vendor's registered business address?",
    vendor_contact_person: "Who is the primary contact person at this vendor? (full name)",
    contract_vendor_id: "What is the Vendor ID for this contract?",
    contract_title: "What is the title or subject of this contract?",
    contract_description: "Provide a detailed description of the contract scope.",
    contract_value: "What is the monetary value of this contract? (number only)",
    contract_currency: "What currency? (e.g. USD, EUR, GBP) — default is USD",
    contract_start_date: "What is the contract start date? (YYYY-MM-DD)",
    contract_end_date: "What is the contract end date? (YYYY-MM-DD)",
};

const STEP_FIELD_MAP: Record<SessionStep, string> = {
    vendor_name: 'name',
    vendor_email: 'email',
    vendor_phone: 'phone',
    vendor_category: 'category',
    vendor_address: 'address',
    vendor_contact_person: 'contact_person',
    contract_vendor_id: 'vendor_id',
    contract_title: 'title',
    contract_description: 'description',
    contract_value: 'value',
    contract_currency: 'currency',
    contract_start_date: 'start_date',
    contract_end_date: 'end_date',
};


@Injectable({ deps: [VendorService] })
export class VendorTools {
    constructor(private readonly vendorService: VendorService) {}

    @Tool({
        name: 'register_vendor',
        description: 'Register a new vendor directly with all required details.',
        inputSchema: RegisterVendorSchema,
    })
    async registerVendor(input: z.infer<typeof RegisterVendorSchema>, ctx: ExecutionContext) {
        const vendor = await this.vendorService.registerVendor(input);
        ctx.logger.info('Vendor registered', { vendor_id: vendor.vendor_id });
        return { success: true, vendor };
    }

    @Tool({
        name: 'create_contract',
        description: 'Create a new contract for a vendor directly with all required details.',
        inputSchema: CreateContractSchema,
    })
    async createContract(input: z.infer<typeof CreateContractSchema>, ctx: ExecutionContext) {
        const contract = await this.vendorService.createContract(input);
        ctx.logger.info('Contract created', { contract_id: contract.contract_id });
        return { success: true, contract };
    }

    @Tool({
        name: 'update_contract',
        description: 'Update fields on an existing contract.',
        inputSchema: UpdateContractSchema,
    })
    async updateContract(input: z.infer<typeof UpdateContractSchema>, ctx: ExecutionContext) {
        const { contract_id, ...updates } = input;
        const contract = await this.vendorService.updateContract(contract_id, updates);
        ctx.logger.info('Contract updated', { contract_id });
        return { success: true, contract };
    }

    @Tool({
        name: 'submit_for_approval',
        description: 'Submit a draft contract for admin approval.',
        inputSchema: ContractIdSchema,
    })
    async submitForApproval(input: z.infer<typeof ContractIdSchema>, ctx: ExecutionContext) {
        const contract = await this.vendorService.submitForApproval(input.contract_id);
        ctx.logger.info('Contract submitted for approval', { contract_id: input.contract_id });
        return { success: true, contract };
    }

   

    //Chat Tools
    @Tool({
        name: 'start_chat_flow',
        description: 'Start a guided step-by-step chat flow to register a vendor, create a contract, or update a contract. Returns a session_id to use with the other chat tools.',
        inputSchema: z.object({
            flow: z.enum(['register_vendor', 'create_contract', 'update_contract']).describe('Which guided flow to start'),
            contract_id: z.string().optional().describe('Required when flow is update_contract'),
        }),
    })
    async startChatFlow(input: { flow: SessionFlow; contract_id?: string }) {
        if (input.flow === 'update_contract' && !input.contract_id) {
            throw new Error("contract_id is required for the update_contract flow.");
        }
        const steps = input.flow === 'register_vendor' ? VENDOR_STEPS : CONTRACT_STEPS;
        const session = await this.vendorService.createSession(input.flow, steps[0], input.contract_id);
        return {
            session_id: session.session_id,
            message: `Starting ${input.flow.replace('_', ' ')} flow. Answer each question to proceed.`,
            question: STEP_QUESTIONS[steps[0]],
            step: steps[0],
        };
    }

    @Tool({
        name: 'get_next_question',
        description: 'Get the next question in an active chat flow session.',
        inputSchema: z.object({ session_id: z.string().describe('Session ID from start_chat_flow') }),
    })
    async getNextQuestion(input: { session_id: string }) {
        const session = await this.vendorService.loadSession(input.session_id);
        if (!session) throw new Error(`Session not found: ${input.session_id}`);

        const steps = session.flow === 'register_vendor' ? VENDOR_STEPS : CONTRACT_STEPS;
        const currentIndex = steps.indexOf(session.step);
        const nextStep = steps[currentIndex + 1];

        if (!nextStep) {
            return { complete: true, message: "All questions answered. Call submit_chat_flow to finalize." };
        }

        session.step = nextStep;
        await this.vendorService.saveSession(session);
        return {
            complete: false,
            question: STEP_QUESTIONS[nextStep],
            step: nextStep,
            session_id: input.session_id,
        };
    }

    @Tool({
        name: 'get_previous_question',
        description: 'Go back to the previous question in an active chat flow session (clears the last answer).',
        inputSchema: z.object({ session_id: z.string().describe('Session ID from start_chat_flow') }),
    })
    async getPreviousQuestion(input: { session_id: string }) {
        const session = await this.vendorService.loadSession(input.session_id);
        if (!session) throw new Error(`Session not found: ${input.session_id}`);

        const steps = session.flow === 'register_vendor' ? VENDOR_STEPS : CONTRACT_STEPS;
        const currentIndex = steps.indexOf(session.step);

        if (currentIndex <= 0) {
            return { atStart: true, message: "Already at the first question." };
        }

        const prevStep = steps[currentIndex - 1];
        const fieldName = STEP_FIELD_MAP[prevStep];
        const previousAnswer = session.answers[fieldName];
        delete session.answers[fieldName];
        session.step = prevStep;
        await this.vendorService.saveSession(session);

        return {
            atStart: false,
            question: STEP_QUESTIONS[prevStep],
            step: prevStep,
            previousAnswer,
            message: "Answer cleared. Use save_answer to re-answer this question.",
            session_id: input.session_id,
        };
    }

    @Tool({
        name: 'save_answer',
        description: 'Save an answer to the current question in an active chat flow session.',
        inputSchema: z.object({
            session_id: z.string().describe('Session ID from start_chat_flow'),
            answer: z.string().describe('Your answer to the current question'),
        }),
    })
    async saveAnswer(input: { session_id: string; answer: string }) {
        const session = await this.vendorService.loadSession(input.session_id);
        if (!session) throw new Error(`Session not found: ${input.session_id}`);

        const fieldName = STEP_FIELD_MAP[session.step];
        if (fieldName === 'value') {
            const num = parseFloat(input.answer);
            if (isNaN(num)) throw new Error("Contract value must be a valid number.");
            session.answers[fieldName] = num;
        } else {
            session.answers[fieldName] = input.answer;
        }

        await this.vendorService.saveSession(session);
        return {
            saved: true,
            field: fieldName,
            value: session.answers[fieldName],
            message: "Answer saved. Call get_next_question to continue or submit_chat_flow when done.",
            session_id: input.session_id,
        };
    }

    @Tool({
        name: 'edit_answer',
        description: 'Edit a previously saved answer for a specific step in the chat session.',
        inputSchema: z.object({
            session_id: z.string().describe('Session ID from start_chat_flow'),
            step: z.string().describe('The step/field name to edit (e.g. vendor_name, contract_title)'),
            answer: z.string().describe('The new answer'),
        }),
    })
    async editAnswer(input: { session_id: string; step: string; answer: string }) {
        const session = await this.vendorService.loadSession(input.session_id);
        if (!session) throw new Error(`Session not found: ${input.session_id}`);

        const step = input.step as SessionStep;
        if (!STEP_FIELD_MAP[step]) throw new Error(`Unknown step: ${input.step}`);

        const fieldName = STEP_FIELD_MAP[step];
        if (fieldName === 'value') {
            const num = parseFloat(input.answer);
            if (isNaN(num)) throw new Error("Contract value must be a valid number.");
            session.answers[fieldName] = num;
        } else {
            session.answers[fieldName] = input.answer;
        }

        await this.vendorService.saveSession(session);
        return { edited: true, field: fieldName, value: session.answers[fieldName], session_id: input.session_id };
    }

    @Tool({
        name: 'submit_chat_flow',
        description: 'Finalize and submit the answers from the guided chat flow to create or update the record.',
        inputSchema: z.object({ session_id: z.string().describe('Session ID from start_chat_flow') }),
    })
    async submitChatFlow(input: { session_id: string }, ctx: ExecutionContext) {
        const session = await this.vendorService.loadSession(input.session_id);
        if (!session) throw new Error(`Session not found: ${input.session_id}`);

        const steps = session.flow === 'register_vendor' ? VENDOR_STEPS : CONTRACT_STEPS;
        const missing = steps.map(s => STEP_FIELD_MAP[s]).filter(f => session.answers[f] === undefined);
        if (missing.length > 0) {
            throw new Error(`Cannot submit — missing answers for: ${missing.join(', ')}`);
        }

        await this.vendorService.deleteSession(input.session_id);

        if (session.flow === 'register_vendor') {
            const vendor = await this.vendorService.registerVendor(session.answers as any);
            ctx.logger.info('Vendor registered via chat flow', { vendor_id: vendor.vendor_id });
            return { success: true, flow: 'register_vendor', vendor };
        }

        if (session.flow === 'create_contract') {
            const contract = await this.vendorService.createContract(session.answers as any);
            ctx.logger.info('Contract created via chat flow', { contract_id: contract.contract_id });
            return { success: true, flow: 'create_contract', contract };
        }

        const contract = await this.vendorService.updateContract(session.contract_id!, session.answers as any);
        ctx.logger.info('Contract updated via chat flow', { contract_id: session.contract_id });
        return { success: true, flow: 'update_contract', contract };
    }
}

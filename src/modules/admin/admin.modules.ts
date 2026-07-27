import { Module } from '@nitrostack/core';
import { ClickHouseService } from '../vendor/clickhouse.service.js';
import { AdminService } from './admin.services.js';
import { AdminTools } from './admin.tools.js';

@Module({
    name: 'AdminModule',
    providers: [ClickHouseService, AdminService],
    controllers: [AdminTools],
})
export class AdminModule {}

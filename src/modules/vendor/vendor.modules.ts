import { Module } from '@nitrostack/core';
import { ClickHouseService } from './clickhouse.service.js';
import { VendorService } from './vendor.service.js';
import { VendorTools } from './vendor.tools.js';

@Module({
    name: 'VendorModule',
    providers: [ClickHouseService, VendorService],
    controllers: [VendorTools],
})
export class VendorModule {}

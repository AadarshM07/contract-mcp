import { Module } from '@nitrostack/core';
import { ClickHouseService } from './clickhouse.service.js';
import { VendorService } from './vendor.service.js';
import { VendorTools } from './vendor.tools.js';

@Module({
    name: 'VendorModule',
    providers: [ClickHouseService, VendorService, VendorTools],
    exports: [VendorService],
})
export class VendorModule {}

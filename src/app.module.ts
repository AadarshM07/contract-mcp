import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { VendorModule } from './modules/vendor/vendor.modules.js';

@McpApp({
    module: AppModule,
    server: {
        name: 'contract-mcp',
        version: '1.0.0',
    },
    logging: {
        level: 'info',
    },
})
@Module({
    name: 'contract-mcp',
    description: 'Vendor & Contract Management MCP powered by ClickHouse',
    imports: [
        ConfigModule.forRoot(),
        VendorModule,
    ],
})
export class AppModule {}

import { Module } from '@nestjs/common'
import { AssetsModule } from './assets/assets.module.js'
import { FlashModule } from './flash/flash.module.js'
import { JarsModule } from './jars/jars.module.js'
import { JavaModule } from './java/java.module.js'
import { RealtimeModule } from './realtime/realtime.module.js'
import { ReportingModule } from './reporting/reporting.module.js'

// Routes register in import order; AssetsModule holds the catch-all route and must stay last.
@Module({ imports: [ReportingModule, JavaModule, FlashModule, JarsModule, RealtimeModule, AssetsModule] })
export class AppModule {}

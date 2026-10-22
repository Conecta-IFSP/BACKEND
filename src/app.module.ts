import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { OrganizacoesModule } from './organizacoes/organizacoes.module.js';
import { ComissoesModule } from './comissoes/comissoes.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SistemaModule } from './sistema/sistema.module.js';
import { ReunioesModule } from './reunioes/reunioes.module.js';
import { ApiKeyGuard } from './auth/api-key.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),

    UsuariosModule,
    OrganizacoesModule,
    ComissoesModule,
    AuthModule,
    SistemaModule,
    ReunioesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}

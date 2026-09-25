import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { OrganizacoesModule } from './organizacoes/organizacoes.module.js';
import { ComissoesModule } from './comissoes/comissoes.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SistemaModule } from './sistema/sistema.module.js';

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
  ],
})
export class AppModule {}

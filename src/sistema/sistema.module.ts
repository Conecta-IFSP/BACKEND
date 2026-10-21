import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module.js';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema.js';
import { Organizacao, OrganizacaoSchema } from '../organizacoes/schemas/organizacao.schema.js';
import { Comissao, ComissaoSchema } from '../comissoes/schemas/comissao.schema.js';
import { Reuniao, ReuniaoSchema } from '../reunioes/schemas/reuniao.schema.js';

import { SistemaController } from './sistema.controller.js';
import { SistemaService } from './sistema.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Usuario.name, schema: UsuarioSchema },
      { name: Organizacao.name, schema: OrganizacaoSchema },
      { name: Comissao.name, schema: ComissaoSchema },
      { name: Reuniao.name, schema: ReuniaoSchema },
    ]),
  ],
  controllers: [SistemaController],
  providers: [SistemaService],
  exports: [SistemaService],
})
export class SistemaModule {}

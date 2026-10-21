import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';

import { ReunioesController } from './reunioes.controller.js';
import { ReunioesService } from './reunioes.service.js';

import { Reuniao, ReuniaoSchema } from './schemas/reuniao.schema.js';
import { Comissao, ComissaoSchema } from '../comissoes/schemas/comissao.schema.js';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema.js';
import {
  Organizacao,
  OrganizacaoSchema,
} from '../organizacoes/schemas/organizacao.schema.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Reuniao.name, schema: ReuniaoSchema },
      { name: Comissao.name, schema: ComissaoSchema },
      { name: Organizacao.name, schema: OrganizacaoSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
  ],
  controllers: [ReunioesController],
  providers: [ReunioesService],
})
export class ReunioesModule {}

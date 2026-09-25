import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MongooseModule } from '@nestjs/mongoose';

import { ComissoesController } from './comissoes.controller.js';
import { ComissoesService } from './comissoes.service.js';

import { Comissao, ComissaoSchema } from './schemas/comissao.schema.js';

import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema.js';

import {
  Organizacao,
  OrganizacaoSchema,
} from '../organizacoes/schemas/organizacao.schema.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      {
        name: Comissao.name,
        schema: ComissaoSchema,
      },
      {
        name: Usuario.name,
        schema: UsuarioSchema,
      },
      {
        name: Organizacao.name,
        schema: OrganizacaoSchema,
      },
    ]),
  ],
  controllers: [ComissoesController],
  providers: [ComissoesService],
  exports: [ComissoesService],
})
export class ComissoesModule {}

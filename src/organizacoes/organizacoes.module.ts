import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { UsuarioAtivoGuard } from './usuario-ativo.guard.js';

import { OrganizacoesController } from './organizacoes.controller.js';
import { OrganizacoesService } from './organizacoes.service.js';

import {
  Organizacao,
  OrganizacaoSchema,
} from './schemas/organizacao.schema.js';

import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema.js';
import { Comissao, ComissaoSchema } from '../comissoes/schemas/comissao.schema.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      {
        name: Organizacao.name,
        schema: OrganizacaoSchema,
      },
      {
        name: Usuario.name,
        schema: UsuarioSchema,
      },
      {
        name: Comissao.name,
        schema: ComissaoSchema,
      },
    ]),
  ],
  controllers: [OrganizacoesController],
  providers: [OrganizacoesService, UsuarioAtivoGuard],
  exports: [OrganizacoesService],
})
export class OrganizacoesModule {}

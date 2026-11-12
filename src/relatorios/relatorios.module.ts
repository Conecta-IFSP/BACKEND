import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { Reuniao, ReuniaoSchema } from '../reunioes/schemas/reuniao.schema.js';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema.js';
import { Comissao, ComissaoSchema } from '../comissoes/schemas/comissao.schema.js';
import { Organizacao, OrganizacaoSchema } from '../organizacoes/schemas/organizacao.schema.js';
import { RelatoriosController } from './relatorios.controller.js';
import { RelatoriosService } from './relatorios.service.js';

@Module({
  imports: [AuthModule, MongooseModule.forFeature([
    { name: Reuniao.name, schema: ReuniaoSchema },
    { name: Usuario.name, schema: UsuarioSchema },
    { name: Comissao.name, schema: ComissaoSchema },
    { name: Organizacao.name, schema: OrganizacaoSchema },
  ])],
  controllers: [RelatoriosController], providers: [RelatoriosService],
})
export class RelatoriosModule {}

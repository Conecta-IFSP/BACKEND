import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { NotificacoesModule } from '../notificacoes/notificacoes.module.js';
import { Reuniao, ReuniaoSchema } from '../reunioes/schemas/reuniao.schema.js';
import { Comissao, ComissaoSchema } from '../comissoes/schemas/comissao.schema.js';
import { Organizacao, OrganizacaoSchema } from '../organizacoes/schemas/organizacao.schema.js';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema.js';
import { PresencasService } from './presencas.service.js';
import { PresencasController } from './presencas.controller.js';
@Module({ imports: [ConfigModule, AuthModule, NotificacoesModule, MongooseModule.forFeature([
  { name: Reuniao.name, schema: ReuniaoSchema }, { name: Comissao.name, schema: ComissaoSchema },
  { name: Organizacao.name, schema: OrganizacaoSchema }, { name: Usuario.name, schema: UsuarioSchema },
])], controllers: [PresencasController], providers: [PresencasService] })
export class PresencasModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { Reuniao, ReuniaoSchema } from '../reunioes/schemas/reuniao.schema.js';
import { Notificacao, NotificacaoSchema } from './notificacao.schema.js';
import { NotificacoesService } from './notificacoes.service.js';
import { NotificacoesController } from './notificacoes.controller.js';
@Module({ imports: [AuthModule, MongooseModule.forFeature([
  { name: Reuniao.name, schema: ReuniaoSchema }, { name: Notificacao.name, schema: NotificacaoSchema },
])], controllers: [NotificacoesController], providers: [NotificacoesService], exports: [NotificacoesService] })
export class NotificacoesModule {}

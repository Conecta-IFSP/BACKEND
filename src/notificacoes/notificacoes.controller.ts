import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type RequisicaoAutenticada } from '../auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { NotificacoesService } from './notificacoes.service.js';
@Controller('notificacoes')
@UseGuards(JwtAuthGuard, UsuarioComumGuard)
export class NotificacoesController {
  constructor(private readonly service: NotificacoesService) {}
  @Get() listar(@Req() req: RequisicaoAutenticada) { return this.service.listar(req.usuario.sub); }
  @Patch(':id/lida') ler(@Param('id') id: string, @Req() req: RequisicaoAutenticada) { return this.service.ler(id, req.usuario.sub); }
}

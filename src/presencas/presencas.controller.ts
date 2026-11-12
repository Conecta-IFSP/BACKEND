import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type RequisicaoAutenticada } from '../auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { PresencasService } from './presencas.service.js';
import { CodigoAcessoDto, CorrigirHorarioDto, EnviarAcessoDto, RegistrarAcessoDto } from './presencas.dto.js';
@Controller('presencas')
@UseGuards(JwtAuthGuard, UsuarioComumGuard)
export class PresencasController {
  constructor(private readonly s: PresencasService) {}
  @Get(':id/gestao') gestao(@Param('id') id: string, @Req() req: RequisicaoAutenticada) { return this.s.gestao(id, req.usuario.sub); }
  @Post(':id/link') gerar(@Param('id') id: string, @Req() req: RequisicaoAutenticada) { return this.s.gerar(id, req.usuario.sub); }
  @Delete(':id/link') revogar(@Param('id') id: string, @Req() req: RequisicaoAutenticada) { return this.s.revogar(id, req.usuario.sub); }
  @Get(':id/acesso') consultar(@Param('id') id: string, @Query() dto: CodigoAcessoDto, @Req() req: RequisicaoAutenticada) { return this.s.consultar(id, dto.codigo, req.usuario.sub); }
  @Post(':id/acesso') registrar(@Param('id') id: string, @Body() dto: RegistrarAcessoDto, @Req() req: RequisicaoAutenticada) { return this.s.registrar(id, dto, req.usuario.sub); }
  @Post(':id/enviar') enviar(@Param('id') id: string, @Body() dto: EnviarAcessoDto, @Req() req: RequisicaoAutenticada) { return this.s.enviar(id, dto, req.usuario.sub); }
  @Patch(':id/horarios/:usuarioId') corrigir(@Param('id') id: string, @Param('usuarioId') alvo: string, @Body() dto: CorrigirHorarioDto, @Req() req: RequisicaoAutenticada) { return this.s.corrigir(id, alvo, dto, req.usuario.sub); }
  @Get(':id/historico') historico(@Param('id') id: string, @Req() req: RequisicaoAutenticada) { return this.s.historico(id, req.usuario.sub); }
}

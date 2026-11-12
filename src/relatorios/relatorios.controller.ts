import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type RequisicaoAutenticada } from '../auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { RelatorioIndividualDto } from './relatorio-individual.dto.js';
import { RelatoriosService } from './relatorios.service.js';

@Controller('relatorios')
@UseGuards(JwtAuthGuard, UsuarioComumGuard)
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  @Get('individual')
  individual(@Req() req: RequisicaoAutenticada, @Query() filtros: RelatorioIndividualDto) {
    // O usuário vem exclusivamente da sessão; não se aceita um id pela URL.
    return this.relatorios.individual(req.usuario.sub, filtros);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { RequisicaoAutenticada } from '../auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { ComissoesService } from './comissoes.service.js';
import { CreateComissaoDto } from './dto/create-comissao.dto.js';
import { UpdateComissaoDto } from './dto/update-comissao.dto.js';
import { AddMembroComissaoDto } from './dto/add-membro-comissao.dto.js';
import { UpdateMembroComissaoDto } from './dto/update-membro-comissao.dto.js';

@UseGuards(JwtAuthGuard, UsuarioComumGuard)
@Controller('comissoes')
export class ComissoesController {
  constructor(private readonly comissoesService: ComissoesService) {}

  @Get('organizacoes')
  listarOrganizacoes(@Req() req: RequisicaoAutenticada) {
    return this.comissoesService.listarOrganizacoes(req.usuario.sub);
  }
  @Get('organizacoes/:id/membros')
  listarMembrosDisponiveis(
    @Param('id') id: string,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.comissoesService.listarMembrosDisponiveis(id, req.usuario.sub);
  }
  @Post()
  criar(@Body() dto: CreateComissaoDto, @Req() req: RequisicaoAutenticada) {
    return this.comissoesService.criar(dto, req.usuario.sub);
  }
  @Get()
  listar(
    @Req() req: RequisicaoAutenticada,
    @Query('organizacao_id') organizacaoId?: string,
  ) {
    return this.comissoesService.listar(req.usuario.sub, organizacaoId);
  }
  @Get(':id')
  buscarPorId(@Param('id') id: string, @Req() req: RequisicaoAutenticada) {
    return this.comissoesService.buscarPorId(id, req.usuario.sub);
  }
  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: UpdateComissaoDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.comissoesService.atualizar(id, dto, req.usuario.sub);
  }
  @Delete(':id')
  remover(@Param('id') id: string, @Req() req: RequisicaoAutenticada) {
    return this.comissoesService.remover(id, req.usuario.sub);
  }
  @Post(':id/membros')
  adicionarMembro(
    @Param('id') id: string,
    @Body() dto: AddMembroComissaoDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.comissoesService.adicionarMembro(id, dto, req.usuario.sub);
  }
  @Patch(':id/membros/:usuarioId')
  atualizarMembro(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() dto: UpdateMembroComissaoDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.comissoesService.atualizarMembro(
      id,
      usuarioId,
      dto.papel,
      req.usuario.sub,
    );
  }
  @Delete(':id/membros/:usuarioId')
  removerMembro(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.comissoesService.removerMembro(id, usuarioId, req.usuario.sub);
  }
}

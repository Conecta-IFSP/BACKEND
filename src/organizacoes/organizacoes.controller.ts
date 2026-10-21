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

import { OrganizacoesService } from './organizacoes.service.js';

import { CreateOrganizacaoDto } from './dto/create-organizacao.dto.js';
import { UpdateOrganizacaoDto } from './dto/update-organizacao.dto.js';
import {
  ConvidarMembroDto,
  EntrarComCodigoDto,
  ResponderConviteDto,
  UpdatePapelMembroDto,
  UpdateStatusMembroDto,
} from './dto/update-status-membro.dto.js';
import {
  JwtAuthGuard,
  type RequisicaoAutenticada,
} from '../auth/jwt-auth.guard.js';
import { AdminSistemaGuard, UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { UsuarioAtivoGuard } from './usuario-ativo.guard.js';

@Controller('organizacoes')
@UseGuards(JwtAuthGuard, UsuarioAtivoGuard)
export class OrganizacoesController {
  constructor(private readonly organizacoesService: OrganizacoesService) {}

  @Post()
  @UseGuards(UsuarioComumGuard)
  criar(
    @Body() createOrganizacaoDto: CreateOrganizacaoDto,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.criar(
      createOrganizacaoDto,
      requisicao.usuario.sub,
    );
  }

  @Get()
  listar(
    @Req() requisicao: RequisicaoAutenticada,
    @Query('busca') busca?: string,
  ) {
    return this.organizacoesService.listar(
      requisicao.usuario.tipo,
      requisicao.usuario.sub,
      busca,
    );
  }

  @Get(':id')
  buscarPorId(
    @Param('id') id: string,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.buscarPorId(id, requisicao.usuario.sub);
  }

  @Patch(':id')
  @UseGuards(AdminSistemaGuard)
  atualizar(
    @Param('id') id: string,
    @Body() updateOrganizacaoDto: UpdateOrganizacaoDto,
  ) {
    return this.organizacoesService.atualizar(id, updateOrganizacaoDto);
  }

  @Delete(':id')
  @UseGuards(AdminSistemaGuard)
  remover(@Param('id') id: string) {
    return this.organizacoesService.remover(id);
  }

  @Post('entrar')
  @UseGuards(UsuarioComumGuard)
  entrarComCodigo(
    @Body() entrarDto: EntrarComCodigoDto,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.entrarComCodigo(entrarDto.codigo, requisicao.usuario.sub);
  }

  @Post(':id/codigo')
  @UseGuards(UsuarioComumGuard)
  gerarNovoCodigo(
    @Param('id') id: string,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.gerarNovoCodigo(id, requisicao.usuario.sub);
  }

  @Delete(':id/membros/:usuarioId')
  @UseGuards(UsuarioComumGuard)
  removerMembro(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.removerMembro(id, usuarioId, requisicao.usuario.sub);
  }

  @Patch(':id/membros/:usuarioId')
  @UseGuards(UsuarioComumGuard)
  atualizarStatusMembro(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() updateStatusDto: UpdateStatusMembroDto,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.atualizarStatusMembro(
      id,
      usuarioId,
      updateStatusDto,
      requisicao.usuario.sub,
    );
  }

  @Patch(':id/membros/:usuarioId/papel')
  @UseGuards(UsuarioComumGuard)
  alterarPapelMembro(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() updatePapelDto: UpdatePapelMembroDto,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.alterarPapelMembro(
      id,
      usuarioId,
      updatePapelDto,
      requisicao.usuario.sub,
    );
  }

  @Post(':id/convites')
  @UseGuards(UsuarioComumGuard)
  convidarMembro(
    @Param('id') id: string,
    @Body() convidarDto: ConvidarMembroDto,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.convidarMembro(id, convidarDto, requisicao.usuario.sub);
  }

  @Patch(':id/convite')
  @UseGuards(UsuarioComumGuard)
  responderConvite(
    @Param('id') id: string,
    @Body() responderDto: ResponderConviteDto,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    return this.organizacoesService.responderConvite(id, requisicao.usuario.sub, responderDto);
  }
}

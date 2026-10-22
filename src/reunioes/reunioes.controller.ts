import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type RequisicaoAutenticada,
} from '../auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { ReunioesService } from './reunioes.service.js';
import { CreateReuniaoDto } from './dto/create-reuniao.dto.js';
import { UpdateReuniaoDto } from './dto/update-reuniao.dto.js';
import { SalvarAtaDto, VersaoAtaDto } from './dto/ata.dto.js';
import {
  AtualizarPresencaDto,
  ResponderConviteReuniaoDto,
} from './dto/acoes-reuniao.dto.js';

@UseGuards(JwtAuthGuard, UsuarioComumGuard)
@Controller('reunioes')
export class ReunioesController {
  constructor(private readonly reunioesService: ReunioesService) {}

  @Get()
  listar(
    @Req() req: RequisicaoAutenticada,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('comissao_id') comissaoId?: string,
  ) {
    return this.reunioesService.listar(req.usuario.sub, {
      de,
      ate,
      comissao_id: comissaoId,
    });
  }
  @Post()
  criar(@Body() dto: CreateReuniaoDto, @Req() req: RequisicaoAutenticada) {
    return this.reunioesService.criar(dto, req.usuario.sub);
  }
  @Get(':id')
  buscarPorId(@Param('id') id: string, @Req() req: RequisicaoAutenticada) {
    return this.reunioesService.buscarPorId(id, req.usuario.sub);
  }
  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: UpdateReuniaoDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.reunioesService.atualizar(id, dto, req.usuario.sub);
  }
  @Patch(':id/convite')
  responderConvite(
    @Param('id') id: string,
    @Body() dto: ResponderConviteReuniaoDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.reunioesService.responderConvite(
      id,
      dto.aceito,
      req.usuario.sub,
    );
  }
  @Post(':id/entrada')
  marcarEntrada(@Param('id') id: string, @Req() req: RequisicaoAutenticada) {
    return this.reunioesService.marcarEntrada(id, req.usuario.sub);
  }
  @Post(':id/saida')
  marcarSaida(@Param('id') id: string, @Req() req: RequisicaoAutenticada) {
    return this.reunioesService.marcarSaida(id, req.usuario.sub);
  }
  @Patch(':id/presencas/:usuarioId')
  atualizarPresenca(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() dto: AtualizarPresencaDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.reunioesService.atualizarPresenca(
      id,
      usuarioId,
      dto.situacao,
      req.usuario.sub,
    );
  }

  @Get(':id/lista-presenca')
  gerarListaPresenca(
    @Param('id') id: string,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.reunioesService.gerarListaPresenca(id, req.usuario.sub);
  }

  @Patch(':id/ata')
  salvarAta(
    @Param('id') id: string,
    @Body() dto: SalvarAtaDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.reunioesService.salvarAta(id, dto, req.usuario.sub);
  }

  @Post(':id/ata/publicar')
  publicarAta(
    @Param('id') id: string,
    @Body() dto: VersaoAtaDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.reunioesService.publicarAta(id, dto.versao, req.usuario.sub);
  }

  @Post(':id/ata/aprovar')
  aprovarAta(
    @Param('id') id: string,
    @Body() dto: VersaoAtaDto,
    @Req() req: RequisicaoAutenticada,
  ) {
    return this.reunioesService.aprovarAta(id, dto.versao, req.usuario.sub);
  }
}

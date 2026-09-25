import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { UsuariosService } from './usuarios.service.js';
import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto.js';
import { AlterarSenhaDto } from './dto/alterar-senha.dto.js';
import { JwtAuthGuard, type RequisicaoAutenticada } from '../auth/jwt-auth.guard.js';
import { AdminSistemaGuard } from '../auth/admin-sistema.guard.js';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  criar(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.criar(createUsuarioDto);
  }

  @UseGuards(JwtAuthGuard, AdminSistemaGuard)
  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  buscarMeuPerfil(@Req() requisicao: RequisicaoAutenticada) {
    return this.usuariosService.buscarPorId(requisicao.usuario.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  atualizarMeuPerfil(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() atualizarPerfilDto: AtualizarPerfilDto,
  ) {
    return this.usuariosService.atualizarPerfil(requisicao.usuario.sub, atualizarPerfilDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/senha')
  alterarMinhaSenha(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() alterarSenhaDto: AlterarSenhaDto,
  ) {
    return this.usuariosService.alterarSenha(requisicao.usuario.sub, alterarSenhaDto);
  }

  @UseGuards(JwtAuthGuard, AdminSistemaGuard)
  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.usuariosService.buscarPorId(id);
  }

  @UseGuards(JwtAuthGuard, AdminSistemaGuard)
  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
  ) {
    return this.usuariosService.atualizar(id, updateUsuarioDto);
  }

  @UseGuards(JwtAuthGuard, AdminSistemaGuard)
  @Delete(':id')
  remover(@Param('id') id: string) {
    return this.usuariosService.remover(id);
  }
}

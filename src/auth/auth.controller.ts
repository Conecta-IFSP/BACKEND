import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RecuperarContaDto } from './dto/recuperar-conta.dto.js';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto.js';
import { VerificarCadastroDto } from './dto/verificar-cadastro.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('verificar-cadastro')
  verificarCadastro(@Body() dto: VerificarCadastroDto) {
    return this.authService.verificarCadastro(dto);
  }

  @Post('recuperar-conta')
  recuperarConta(@Body() recuperarContaDto: RecuperarContaDto) {
    return this.authService.solicitarRecuperacao(recuperarContaDto);
  }

  @Post('redefinir-senha')
  redefinirSenha(@Body() redefinirSenhaDto: RedefinirSenhaDto) {
    return this.authService.redefinirSenha(redefinirSenhaDto);
  }

  @Get('abrir-redefinicao')
  @Header('Content-Type', 'text/html; charset=utf-8')
  abrirRedefinicao(
    @Query('token') token: string,
    @Query('redirect_url') redirectUrl: string,
  ) {
    return this.authService.criarPaginaRedefinicao(token, redirectUrl);
  }
}

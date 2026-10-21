import { Body, Controller, Get, Header, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RecuperarContaDto } from './dto/recuperar-conta.dto.js';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto.js';
import { VerificarCadastroDto } from './dto/verificar-cadastro.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

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

  @Get('google/callback')
  callbackGoogle(
    @Query('code') code: string,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    // Mobile: redireciona para deep link do app
    const deepLink = `conectamais://auth/google?code=${encodeURIComponent(code)}`
      + (state ? `&state=${encodeURIComponent(state)}` : '');
    return res.redirect(deepLink);
  }

  @Get('google/callback-web')
  callbackGoogleWeb(
    @Query('code') code: string,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    // Web: redireciona para a página de callback do frontend
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:8081';
    const webRedirect = `${frontendUrl}/login/google-callback?code=${encodeURIComponent(code)}`
      + (state ? `&state=${encodeURIComponent(state)}` : '');
    return res.redirect(webRedirect);
  }

  @Post('google')
  loginComGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginComGoogle(dto);
  }
}

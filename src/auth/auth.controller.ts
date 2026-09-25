import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RecuperarContaDto } from './dto/recuperar-conta.dto.js';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('recuperar-conta')
  recuperarConta(@Body() recuperarContaDto: RecuperarContaDto) {
    return this.authService.solicitarRecuperacao(recuperarContaDto);
  }

  @Post('redefinir-senha')
  redefinirSenha(@Body() redefinirSenhaDto: RedefinirSenhaDto) {
    return this.authService.redefinirSenha(redefinirSenhaDto);
  }
}

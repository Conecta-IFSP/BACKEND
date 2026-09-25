import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminSistemaGuard } from '../auth/admin-sistema.guard.js';
import { SistemaService } from './sistema.service.js';

@UseGuards(JwtAuthGuard, AdminSistemaGuard)
@Controller('sistema')
export class SistemaController {
  constructor(private readonly sistemaService: SistemaService) {}

  @Get('status')
  status() {
    return this.sistemaService.status();
  }

  @Get('relatorios')
  relatorios() {
    return this.sistemaService.relatorios();
  }

  @Post('reset')
  reset() {
    return this.sistemaService.reset();
  }

  @Post('popular-teste')
  popularDadosDeTeste() {
    return this.sistemaService.popularDadosDeTeste();
  }
}

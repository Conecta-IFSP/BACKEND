import { Test, TestingModule } from '@nestjs/testing';
import { OrganizacoesController } from './organizacoes.controller.js';
import { OrganizacoesService } from './organizacoes.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminSistemaGuard } from '../auth/admin-sistema.guard.js';
import { UsuarioAtivoGuard } from './usuario-ativo.guard.js';

describe('OrganizacoesController', () => {
  let controller: OrganizacoesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizacoesController],
      providers: [{ provide: OrganizacoesService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UsuarioAtivoGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminSistemaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizacoesController>(OrganizacoesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

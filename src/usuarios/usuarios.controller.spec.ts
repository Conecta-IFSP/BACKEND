import { vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsuariosController } from './usuarios.controller.js';
import { UsuariosService } from './usuarios.service.js';
import { AuthService } from '../auth/auth.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminSistemaGuard } from '../auth/admin-sistema.guard.js';

const novoUsuario = { nome: 'Ana Souza', email: 'ana@exemplo.com', senha: 'segredo123' };

describe('UsuariosController', () => {
  let controller: UsuariosController;
  const usuariosService = { criar: vi.fn(), descartarNaoVerificado: vi.fn() };
  const authService = { enviarCodigoVerificacao: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    usuariosService.criar.mockResolvedValue({ _id: 'u1' });
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuariosController],
      providers: [
        { provide: UsuariosService, useValue: usuariosService },
        { provide: AuthService, useValue: authService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminSistemaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsuariosController>(UsuariosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('cria a conta e envia o código de confirmação', async () => {
    await expect(controller.criar(novoUsuario)).resolves.toEqual({
      mensagem: 'Conta criada. Confira seu e-mail para finalizar o cadastro.',
    });
    expect(authService.enviarCodigoVerificacao).toHaveBeenCalledWith('u1');
    expect(usuariosService.descartarNaoVerificado).not.toHaveBeenCalled();
  });

  it('desfaz o cadastro quando o e-mail de confirmação não sai', async () => {
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    authService.enviarCodigoVerificacao.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    await expect(controller.criar(novoUsuario)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(usuariosService.descartarNaoVerificado).toHaveBeenCalledWith('u1');
    expect(registro).toHaveBeenCalled();
    registro.mockRestore();
  });
});

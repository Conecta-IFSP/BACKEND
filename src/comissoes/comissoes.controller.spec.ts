import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ComissoesController } from './comissoes.controller.js';
import { ComissoesService } from './comissoes.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { TipoUsuario, Usuario } from '../usuarios/schemas/usuario.schema.js';
import { getModelToken } from '@nestjs/mongoose';

describe('ComissoesController', () => {
  let controller: ComissoesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComissoesController],
      providers: [{ provide: ComissoesService, useValue: {} }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();

    controller = module.get<ComissoesController>(ComissoesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('Rotas autenticadas de comissões', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const usuarioId = '507f1f77bcf86cd799439011';
  let tipoAtual: TipoUsuario;
  const service = {
    listar: vi.fn().mockResolvedValue([]),
    criar: vi.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    tipoAtual = TipoUsuario.USUARIO;
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-exclusivo-dos-testes' })],
      controllers: [ComissoesController],
      providers: [
        JwtAuthGuard,
        UsuarioComumGuard,
        { provide: getModelToken(Usuario.name), useValue: {
          findOne: () => ({ exec: async () => ({ tipo: tipoAtual }) }),
        } },
        { provide: ComissoesService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    jwt = module.get(JwtService);
  });
  afterEach(async () => {
    await app?.close();
  });

  it('libera as comissões para os usuários', async () => {
    const token = jwt.sign({ sub: usuarioId, tipo: TipoUsuario.USUARIO });

    await request(app.getHttpServer())
      .get('/comissoes')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(service.listar).toHaveBeenCalledWith(usuarioId, undefined);
  });

  it('impede o administrador do sistema de criar e gerenciar comissões', async () => {
    tipoAtual = TipoUsuario.ADMIN_SISTEMA;
    const token = jwt.sign({ sub: usuarioId, tipo: TipoUsuario.ADMIN_SISTEMA });
    const servidor = app.getHttpServer();

    await request(servidor)
      .get('/comissoes')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(servidor)
      .post('/comissoes')
      .auth(token, { type: 'bearer' })
      .send({ nome: 'Comissão do administrador', organizacao_id: usuarioId })
      .expect(403);

    expect(service.listar).not.toHaveBeenCalled();
    expect(service.criar).not.toHaveBeenCalled();
  });
});

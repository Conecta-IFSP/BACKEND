import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { UsuariosController } from './usuarios.controller.js';
import { UsuariosService } from './usuarios.service.js';
import { Usuario, TipoUsuario } from './schemas/usuario.schema.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminSistemaGuard } from '../auth/admin-sistema.guard.js';

describe('Permissões atuais com token antigo', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let conta: { ativo: boolean; tipo: TipoUsuario } | null;
  const id = '507f1f77bcf86cd799439011';
  const service = {
    criar: vi.fn().mockResolvedValue({}),
    listar: vi.fn().mockResolvedValue([]),
    buscarPorId: vi.fn().mockResolvedValue({}),
    atualizar: vi.fn().mockResolvedValue({}),
    remover: vi.fn().mockResolvedValue({}),
    atualizarPerfil: vi.fn().mockResolvedValue({}),
    alterarSenha: vi.fn().mockResolvedValue({}),
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    conta = { ativo: true, tipo: TipoUsuario.ADMIN_SISTEMA };
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-exclusivo-dos-testes' })],
      controllers: [UsuariosController],
      providers: [JwtAuthGuard, AdminSistemaGuard,
        { provide: UsuariosService, useValue: service },
        { provide: getModelToken(Usuario.name), useValue: {
          findOne: vi.fn(() => ({ exec: async () => conta?.ativo ? conta : null })),
        } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    jwt = module.get(JwtService);
  });
  afterEach(async () => { await app?.close(); });

  it('revoga todas as operações administrativas sem trocar o token', async () => {
    const token = jwt.sign({ sub: id, tipo: TipoUsuario.ADMIN_SISTEMA });
    await request(app.getHttpServer()).get('/usuarios').auth(token, { type: 'bearer' }).expect(200);
    conta!.tipo = TipoUsuario.USUARIO;
    vi.clearAllMocks();
    for (const method of ['get', 'patch', 'delete'] as const) {
      await request(app.getHttpServer())[method](`/usuarios/${id}`).auth(token, { type: 'bearer' }).expect(403);
    }
    await request(app.getHttpServer()).get('/usuarios').auth(token, { type: 'bearer' }).expect(403);
    expect(service.listar).not.toHaveBeenCalled();
    expect(service.atualizar).not.toHaveBeenCalled();
    expect(service.remover).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/usuarios/me').auth(token, { type: 'bearer' }).expect(200);
  });

  it.each(['desativada', 'excluída'])('bloqueia conta %s com token válido', async (estado) => {
    const token = jwt.sign({ sub: id, tipo: TipoUsuario.ADMIN_SISTEMA });
    await request(app.getHttpServer()).get('/usuarios/me').auth(token, { type: 'bearer' }).expect(200);
    if (estado === 'desativada') conta!.ativo = false;
    else conta = null;
    vi.clearAllMocks();
    for (const rota of ['/usuarios', '/usuarios/me', `/usuarios/${id}`]) {
      await request(app.getHttpServer()).get(rota).auth(token, { type: 'bearer' }).expect(401);
    }
    for (const rota of ['/usuarios/me', '/usuarios/me/senha', `/usuarios/${id}`]) {
      await request(app.getHttpServer()).patch(rota).auth(token, { type: 'bearer' }).send({}).expect(401);
    }
    await request(app.getHttpServer()).delete(`/usuarios/${id}`).auth(token, { type: 'bearer' }).expect(401);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it('mantém cadastro público e recusa tokens inválidos ou expirados', async () => {
    await request(app.getHttpServer()).post('/usuarios').send({}).expect(201);
    await request(app.getHttpServer()).get('/usuarios/me').expect(401);
    for (const token of ['invalido', jwt.sign({ sub: id }, { expiresIn: -1 }), jwt.sign({ sub: 'invalido' })]) {
      await request(app.getHttpServer()).get('/usuarios/me').auth(token, { type: 'bearer' }).expect(401);
    }
  });
});

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { OrganizacoesController } from './organizacoes.controller.js';
import { OrganizacoesService } from './organizacoes.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminSistemaGuard, UsuarioComumGuard } from '../auth/admin-sistema.guard.js';
import { UsuarioAtivoGuard } from './usuario-ativo.guard.js';
import { TipoUsuario, Usuario } from '../usuarios/schemas/usuario.schema.js';

describe('Rotas autenticadas de organizações', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let token: string;
  const usuarioId = '507f1f77bcf86cd799439011';
  const orgId = '507f1f77bcf86cd799439012';
  let conta: { ativo: boolean; tipo: TipoUsuario } | null;
  const service = {
    criar: vi.fn().mockResolvedValue({}),
    listar: vi.fn().mockResolvedValue([]),
    buscarPorId: vi.fn().mockResolvedValue({}),
    atualizar: vi.fn().mockResolvedValue({}),
    remover: vi.fn().mockResolvedValue({}),
    adicionarMembro: vi.fn().mockResolvedValue({}),
    atualizarStatusMembro: vi.fn().mockResolvedValue({}),
    removerMembro: vi.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    conta = { ativo: true, tipo: TipoUsuario.USUARIO };
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-exclusivo-dos-testes' })],
      controllers: [OrganizacoesController],
      providers: [
        JwtAuthGuard,
        AdminSistemaGuard,
        UsuarioComumGuard,
        UsuarioAtivoGuard,
        { provide: OrganizacoesService, useValue: service },
        {
          provide: getModelToken(Usuario.name),
          useValue: {
            findOne: vi.fn(() => ({
              exec: async () => (conta?.ativo ? conta : null),
            })),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    jwt = module.get(JwtService);
    token = jwt.sign({ sub: usuarioId, tipo: TipoUsuario.USUARIO });
  });
  afterEach(async () => {
    await app?.close();
  });

  it('exige token em todas as rotas de organizações', async () => {
    const servidor = app.getHttpServer();
    await request(servidor).get('/organizacoes').expect(401);
    await request(servidor)
      .post('/organizacoes')
      .send({ nome: 'Teste' })
      .expect(401);
    await request(servidor).get(`/organizacoes/${orgId}`).expect(401);
    await request(servidor)
      .patch(`/organizacoes/${orgId}`)
      .send({})
      .expect(401);
    await request(servidor).delete(`/organizacoes/${orgId}`).expect(401);
    await request(servidor)
      .post(`/organizacoes/${orgId}/membros`)
      .send({})
      .expect(401);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/membros/${usuarioId}`)
      .send({ status: 'APROVADO' })
      .expect(401);
  });

  it('protege a remoção e encaminha a identidade autenticada', async () => {
    const servidor = app.getHttpServer();
    const rota = `/organizacoes/${orgId}/membros/${orgId}`;
    await request(servidor).delete(rota).expect(401);
    await request(servidor).delete(rota).auth(token, { type: 'bearer' }).expect(200);
    expect(service.removerMembro).toHaveBeenCalledWith(orgId, orgId, usuarioId);
    service.removerMembro.mockClear();
    conta!.tipo = TipoUsuario.ADMIN_SISTEMA;
    await request(servidor).delete(rota).auth(token, { type: 'bearer' }).expect(403);
    conta!.ativo = false;
    await request(servidor).delete(rota).auth(token, { type: 'bearer' }).expect(401);
    expect(service.removerMembro).not.toHaveBeenCalled();
  });

  it('recusa tokens inválidos, expirados e contas desativadas ou excluídas', async () => {
    for (const valor of [
      'invalido',
      jwt.sign({ sub: usuarioId }, { expiresIn: -1 }),
    ]) {
      await request(app.getHttpServer())
        .get('/organizacoes')
        .auth(valor, { type: 'bearer' })
        .expect(401);
    }
    conta!.ativo = false;
    await request(app.getHttpServer())
      .get('/organizacoes')
      .auth(token, { type: 'bearer' })
      .expect(401);
    conta = null;
    await request(app.getHttpServer())
      .get('/organizacoes')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });

  it('usa a sessão mesmo que o corpo tente solicitar por outra pessoa como ADMIN', async () => {
    await request(app.getHttpServer())
      .post(`/organizacoes/${orgId}/membros`)
      .auth(token, { type: 'bearer' })
      .send({ usuario_id: orgId, papel: 'ADMIN' })
      .expect(201);
    expect(service.adicionarMembro).toHaveBeenCalledWith(orgId, usuarioId);
  });

  it('informa o papel atualizado ao listar organizações', async () => {
    conta!.tipo = TipoUsuario.ADMIN_SISTEMA;

    await request(app.getHttpServer())
      .get('/organizacoes')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(service.listar).toHaveBeenCalledWith(
      TipoUsuario.ADMIN_SISTEMA,
      usuarioId,
    );
  });

  it('criação ignora autor e status forjados no corpo', async () => {
    await request(app.getHttpServer())
      .post('/organizacoes')
      .auth(token, { type: 'bearer' })
      .send({ nome: 'Minha organização', criada_por: orgId, status: 'APROVADA' })
      .expect(201);
    expect(service.criar).toHaveBeenCalledWith(
      { nome: 'Minha organização' },
      usuarioId,
    );
  });

  it('encaminha a identidade para a verificação do administrador da organização', async () => {
    await request(app.getHttpServer())
      .patch(`/organizacoes/${orgId}/membros/${orgId}`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'REJEITADO' })
      .expect(200);
    expect(service.atualizarStatusMembro).toHaveBeenCalledWith(
      orgId,
      orgId,
      { status: 'REJEITADO' },
      usuarioId,
    );
  });

  it('não aceita decisão PENDENTE', async () => {
    await request(app.getHttpServer())
      .patch(`/organizacoes/${orgId}/membros/${usuarioId}`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'PENDENTE' })
      .expect(400);
    expect(service.atualizarStatusMembro).not.toHaveBeenCalled();
  });

  it('reserva alterações globais ao administrador do sistema e revalida seu papel', async () => {
    const antigoTokenAdmin = jwt.sign({
      sub: usuarioId,
      tipo: TipoUsuario.ADMIN_SISTEMA,
    });
    await request(app.getHttpServer())
      .patch(`/organizacoes/${orgId}`)
      .auth(antigoTokenAdmin, { type: 'bearer' })
      .send({ status: 'APROVADA' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/organizacoes/${orgId}`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    conta!.tipo = TipoUsuario.ADMIN_SISTEMA;
    await request(app.getHttpServer())
      .patch(`/organizacoes/${orgId}`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'APROVADA' })
      .expect(200);
  });

  it('impede o administrador do sistema de criar e participar de organizações', async () => {
    conta!.tipo = TipoUsuario.ADMIN_SISTEMA;
    const servidor = app.getHttpServer();

    await request(servidor)
      .post('/organizacoes')
      .auth(token, { type: 'bearer' })
      .send({ nome: 'Organização do administrador' })
      .expect(403);
    await request(servidor)
      .post(`/organizacoes/${orgId}/membros`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/membros/${usuarioId}`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'APROVADO' })
      .expect(403);

    expect(service.criar).not.toHaveBeenCalled();
    expect(service.adicionarMembro).not.toHaveBeenCalled();
    expect(service.atualizarStatusMembro).not.toHaveBeenCalled();
  });
});

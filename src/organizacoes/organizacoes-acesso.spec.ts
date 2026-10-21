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
    entrarComCodigo: vi.fn().mockResolvedValue({}),
    gerarNovoCodigo: vi.fn().mockResolvedValue({}),
    atualizarStatusMembro: vi.fn().mockResolvedValue({}),
    removerMembro: vi.fn().mockResolvedValue({}),
    alterarPapelMembro: vi.fn().mockResolvedValue({}),
    convidarMembro: vi.fn().mockResolvedValue({}),
    responderConvite: vi.fn().mockResolvedValue({}),
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
      .post('/organizacoes/entrar')
      .send({ codigo: 'K7QX4M9P2A' })
      .expect(401);
    await request(servidor).post(`/organizacoes/${orgId}/codigo`).expect(401);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/membros/${usuarioId}`)
      .send({ status: 'APROVADO' })
      .expect(401);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/membros/${usuarioId}/papel`)
      .send({ papel: 'ADMIN' })
      .expect(401);
    await request(servidor)
      .post(`/organizacoes/${orgId}/convites`)
      .send({ email: 'pessoa@teste.com' })
      .expect(401);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/convite`)
      .send({ aceitar: true })
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

  it('entrar com código valida o corpo e usa a sessão mesmo que o corpo tente outra pessoa', async () => {
    const servidor = app.getHttpServer();
    await request(servidor)
      .post('/organizacoes/entrar')
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(400);
    await request(servidor)
      .post('/organizacoes/entrar')
      .auth(token, { type: 'bearer' })
      .send({ codigo: 'K7QX4-M9P2A', usuario_id: orgId, papel: 'ADMIN' })
      .expect(201);
    expect(service.entrarComCodigo).toHaveBeenCalledWith('K7QX4-M9P2A', usuarioId);
  });

  it('gerar novo código usa o solicitante da sessão', async () => {
    await request(app.getHttpServer())
      .post(`/organizacoes/${orgId}/codigo`)
      .auth(token, { type: 'bearer' })
      .expect(201);
    expect(service.gerarNovoCodigo).toHaveBeenCalledWith(orgId, usuarioId);
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
      undefined,
    );
  });

  it('encaminha o termo de busca da listagem', async () => {
    await request(app.getHttpServer())
      .get('/organizacoes')
      .query({ busca: 'Conselho' })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(service.listar).toHaveBeenCalledWith(TipoUsuario.USUARIO, usuarioId, 'Conselho');
  });

  it('troca de papel valida o papel e usa o solicitante da sessão', async () => {
    const rota = `/organizacoes/${orgId}/membros/${orgId}/papel`;
    await request(app.getHttpServer())
      .patch(rota)
      .auth(token, { type: 'bearer' })
      .send({ papel: 'DONO' })
      .expect(400);
    expect(service.alterarPapelMembro).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .patch(rota)
      .auth(token, { type: 'bearer' })
      .send({ papel: 'ADMIN', solicitante: orgId })
      .expect(200);
    expect(service.alterarPapelMembro).toHaveBeenCalledWith(
      orgId,
      orgId,
      { papel: 'ADMIN' },
      usuarioId,
    );
  });

  it('convite valida o e-mail e é respondido sempre pela pessoa autenticada', async () => {
    const servidor = app.getHttpServer();
    await request(servidor)
      .post(`/organizacoes/${orgId}/convites`)
      .auth(token, { type: 'bearer' })
      .send({ email: 'isto não é e-mail' })
      .expect(400);
    await request(servidor)
      .post(`/organizacoes/${orgId}/convites`)
      .auth(token, { type: 'bearer' })
      .send({ email: 'pessoa@teste.com' })
      .expect(201);
    expect(service.convidarMembro).toHaveBeenCalledWith(orgId, { email: 'pessoa@teste.com' }, usuarioId);

    await request(servidor)
      .patch(`/organizacoes/${orgId}/convite`)
      .auth(token, { type: 'bearer' })
      .send({ aceitar: 'sim' })
      .expect(400);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/convite`)
      .auth(token, { type: 'bearer' })
      .send({ aceitar: true, usuario_id: orgId })
      .expect(200);
    expect(service.responderConvite).toHaveBeenCalledWith(orgId, usuarioId, { aceitar: true });
  });

  it('impede o administrador do sistema de trocar papéis, convidar e responder convites', async () => {
    conta!.tipo = TipoUsuario.ADMIN_SISTEMA;
    const servidor = app.getHttpServer();
    await request(servidor)
      .patch(`/organizacoes/${orgId}/membros/${usuarioId}/papel`)
      .auth(token, { type: 'bearer' })
      .send({ papel: 'ADMIN' })
      .expect(403);
    await request(servidor)
      .post(`/organizacoes/${orgId}/convites`)
      .auth(token, { type: 'bearer' })
      .send({ email: 'pessoa@teste.com' })
      .expect(403);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/convite`)
      .auth(token, { type: 'bearer' })
      .send({ aceitar: true })
      .expect(403);
    expect(service.alterarPapelMembro).not.toHaveBeenCalled();
    expect(service.convidarMembro).not.toHaveBeenCalled();
    expect(service.responderConvite).not.toHaveBeenCalled();
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
      .post('/organizacoes/entrar')
      .auth(token, { type: 'bearer' })
      .send({ codigo: 'K7QX4M9P2A' })
      .expect(403);
    await request(servidor)
      .post(`/organizacoes/${orgId}/codigo`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(servidor)
      .patch(`/organizacoes/${orgId}/membros/${usuarioId}`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'APROVADO' })
      .expect(403);

    expect(service.criar).not.toHaveBeenCalled();
    expect(service.entrarComCodigo).not.toHaveBeenCalled();
    expect(service.gerarNovoCodigo).not.toHaveBeenCalled();
    expect(service.atualizarStatusMembro).not.toHaveBeenCalled();
  });
});

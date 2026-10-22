// Executar após npm run build. Usa exclusivamente banco temporário local.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { UsuarioSchema } from '../dist/usuarios/schemas/usuario.schema.js';
import { OrganizacaoSchema } from '../dist/organizacoes/schemas/organizacao.schema.js';
import { ComissaoSchema } from '../dist/comissoes/schemas/comissao.schema.js';
import { ReuniaoSchema } from '../dist/reunioes/schemas/reuniao.schema.js';
import { ComissoesService } from '../dist/comissoes/comissoes.service.js';
import { ReunioesService } from '../dist/reunioes/reunioes.service.js';
import { ComissoesController } from '../dist/comissoes/comissoes.controller.js';
import { ReunioesController } from '../dist/reunioes/reunioes.controller.js';
import { JwtAuthGuard } from '../dist/auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../dist/auth/admin-sistema.guard.js';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

const banco = `conecta_teste_comissoes_${randomUUID().replaceAll('-', '')}`;
await mongoose.connect(`mongodb://127.0.0.1:27017/${banco}`, { serverSelectionTimeoutMS: 5000 });
let app;
try {
  const U = mongoose.model('Usuario', UsuarioSchema);
  const O = mongoose.model('Organizacao', OrganizacaoSchema);
  const C = mongoose.model('Comissao', ComissaoSchema);
  const R = mongoose.model('Reuniao', ReuniaoSchema);
  const pessoas = await U.create(['Admin', 'Ana', 'Bruno'].map((nome) => ({ nome, email: `${nome}@teste.local`, senha_hash: 'fixture-sem-login' })));
  const [admin, ana, bruno] = pessoas;
  const org = await O.create({ nome: 'Teste isolado', criada_por: admin._id, status: 'APROVADA', membros: pessoas.map((p) => ({ usuario_id: p._id, papel: p.id === admin.id ? 'ADMIN' : 'MEMBRO', status: 'APROVADO' })) });
  const cs = new ComissoesService(C, O, U);
  const rs = new ReunioesService(R, C, O, U);
  let comissao = await cs.criar({ nome: 'Comissão', organizacao_id: org.id, responsavel_id: ana.id }, admin.id);
  assert.equal(comissao.membros.length, 1);
  await cs.adicionarMembro(comissao.id, { usuario_id: bruno.id }, admin.id);
  await cs.definirResponsavel(comissao.id, bruno.id, admin.id);
  comissao = await C.findById(comissao.id);
  assert.equal(comissao.membros.filter((m) => m.papel === 'RESPONSAVEL').length, 1);
  assert.equal(comissao.membros.find((m) => m.papel === 'RESPONSAVEL').usuario_id.toString(), bruno.id);
  await assert.rejects(cs.removerMembro(comissao.id, bruno.id, admin.id));
  // Duas escritas com a mesma fotografia: somente uma pode vencer.
  const fotografia = await C.findById(comissao.id);
  const disputas = await Promise.allSettled([
    cs.gravarEquipe(fotografia, [...fotografia.membros].reverse()), cs.gravarEquipe(fotografia, fotografia.membros.map((m) => ({ usuario_id: m.usuario_id, adicionado_em: m.adicionado_em, papel: m.usuario_id.toString() === ana.id ? 'RESPONSAVEL' : 'MEMBRO' }))),
  ]);
  assert.equal(disputas.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(disputas.filter((r) => r.status === 'rejected').length, 1);
  await cs.definirResponsavel(comissao.id, bruno.id, admin.id);
  const encerrada = await R.create({ comissao_id: comissao._id, titulo: 'Reunião encerrada', local: 'Sala', inicio: new Date(Date.now() - 7200000), fim: new Date(Date.now() - 3600000), criada_por: bruno._id, participantes: [ana, bruno].map((p) => ({ usuario_id: p._id, convite: 'ACEITO', presenca: { entrada: new Date(Date.now() - 7200000), saida: new Date(Date.now() - 3600000), situacao: 'CONFIRMADA', marcada_por: 'PROPRIO' } })) });
  let ata = await rs.salvarAta(encerrada.id, { conteudo: 'Decisões e encaminhamentos da reunião de teste.', versao: 0 }, bruno.id);
  assert.equal(ata.ata.versao, 1);
  await assert.rejects(rs.salvarAta(encerrada.id, { conteudo: 'Uma versão antiga não poderá sobrescrever a atual.', versao: 0 }, bruno.id));
  await rs.publicarAta(encerrada.id, 1, bruno.id);
  await rs.aprovarAta(encerrada.id, 1, ana.id);
  ata = await rs.aprovarAta(encerrada.id, 1, bruno.id);
  assert.equal(ata.ata.situacao, 'APROVADA');
  assert.equal(ata.ata.aprovacoes.length, 2);
  await rs.aprovarAta(encerrada.id, 1, bruno.id);
  const lista = await rs.gerarListaPresenca(encerrada.id, ana.id);
  assert.equal(lista.participantes.length, 2);
  assert.equal(lista.participantes[0].minutos, 60);
  const jwt = new JwtService({ secret: randomUUID() });
  const modulo = await Test.createTestingModule({
    controllers: [ComissoesController, ReunioesController],
    providers: [
      { provide: ComissoesService, useValue: cs }, { provide: ReunioesService, useValue: rs },
      JwtAuthGuard, UsuarioComumGuard,
      { provide: JwtService, useValue: jwt }, { provide: getModelToken('Usuario'), useValue: U },
    ],
  }).compile();
  app = modulo.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const http = request(app.getHttpServer());
  const tokenAdmin = await jwt.signAsync({ sub: admin.id });
  const tokenMembro = await jwt.signAsync({ sub: ana.id });
  await http.get('/comissoes').expect(401);
  await http.get('/comissoes').set('Authorization', 'Bearer invalido').expect(401);
  await http.post('/comissoes').set('Authorization', `Bearer ${tokenAdmin}`).send({ nome: 'Sem responsável', organizacao_id: org.id }).expect(400);
  await http.post('/comissoes').set('Authorization', `Bearer ${tokenMembro}`).send({ nome: 'Sem autorização', organizacao_id: org.id, responsavel_id: ana.id }).expect(403);
  await http.patch(`/comissoes/${comissao.id}/responsavel`).set('Authorization', `Bearer ${tokenAdmin}`).send({ usuario_id: ana.id }).expect(200);
  await http.get(`/reunioes/${encerrada.id}/lista-presenca`).expect(401);
  await http.get(`/reunioes/${encerrada.id}/lista-presenca`).set('Authorization', `Bearer ${tokenMembro}`).expect(200);
  await http.patch(`/reunioes/${encerrada.id}/ata`).set('Authorization', `Bearer ${tokenAdmin}`).send({ conteudo: 'curto', versao: -1 }).expect(400);
  const criadaSelecionada = await http.post('/reunioes').set('Authorization', `Bearer ${tokenMembro}`).send({
    comissao_id: comissao.id, titulo: 'Seleção real de convidados', local: 'Sala de teste',
    inicio: new Date(Date.now() + 3600000).toISOString(), fim: new Date(Date.now() + 7200000).toISOString(),
    convidados_ids: [bruno.id],
  }).expect(201);
  assert.deepEqual(criadaSelecionada.body.participantes.map((p) => p.usuario_id._id).sort(), [ana.id, bruno.id].sort());
  const persistida = await R.findById(criadaSelecionada.body._id);
  assert.equal(persistida.participantes.length, 2);
  // O guard usa tipo atual no banco, não um tipo antigo presente no JWT.
  await U.updateOne({ _id: admin._id }, { $set: { tipo: 'ADMIN_SISTEMA' } });
  await http.get('/comissoes').set('Authorization', `Bearer ${tokenAdmin}`).expect(403);
  console.log('PASSOU: HTTP real — JWT, tipo atual de usuário, DTO, autorização, transferência e lista.');
  console.log('PASSOU: MongoDB real — cadastro, equipe, transferência, proteção do responsável, ata versionada, publicação, aprovação e lista.');
} finally {
  await app?.close();
  if (mongoose.connection.name === banco && banco.startsWith('conecta_teste_comissoes_')) {
    await mongoose.connection.dropDatabase();
  } else {
    console.error('Banco inesperado: limpeza abortada');
    process.exitCode = 1;
  }
  await mongoose.disconnect();
}

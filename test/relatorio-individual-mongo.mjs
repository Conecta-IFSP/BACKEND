// Executar após npm run build; banco temporário local, separado de dados reais.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { UsuarioSchema } from '../dist/usuarios/schemas/usuario.schema.js';
import { ComissaoSchema } from '../dist/comissoes/schemas/comissao.schema.js';
import { OrganizacaoSchema } from '../dist/organizacoes/schemas/organizacao.schema.js';
import { ReuniaoSchema } from '../dist/reunioes/schemas/reuniao.schema.js';
import { RelatoriosService } from '../dist/relatorios/relatorios.service.js';
import { RelatoriosController } from '../dist/relatorios/relatorios.controller.js';
import { JwtAuthGuard } from '../dist/auth/jwt-auth.guard.js';
import { UsuarioComumGuard } from '../dist/auth/admin-sistema.guard.js';
import { ApiKeyGuard } from '../dist/auth/api-key.guard.js';

const banco = `conecta_teste_relatorio_${randomUUID().replaceAll('-', '')}`;
await mongoose.connect(`mongodb://127.0.0.1:${process.env.TEST_MONGO_PORT || '27019'}/${banco}`, { serverSelectionTimeoutMS: 5000 });
let app;
try {
  const U = mongoose.model('Usuario', UsuarioSchema);
  const O = mongoose.model('Organizacao', OrganizacaoSchema);
  const C = mongoose.model('Comissao', ComissaoSchema);
  const R = mongoose.model('Reuniao', ReuniaoSchema);
  const [ana, outra, admin, vazio] = await U.create(['Ana', 'Outra', 'Admin', 'Vazio'].map(nome => ({ nome, email: `${nome.toLowerCase()}@teste.local`, tipo: nome === 'Admin' ? 'ADMIN_SISTEMA' : 'USUARIO' })));
  const organizacao = new mongoose.Types.ObjectId();
  const comissao = new mongoose.Types.ObjectId();
  await O.collection.insertOne({ _id: organizacao, nome: 'Organização de teste' });
  await C.collection.insertOne({ _id: comissao, nome: 'Comissão de teste', organizacao_id: organizacao });
  const base = Date.now() - 7 * 86400000;
  const data = minutos => new Date(base + minutos * 60000);
  const participante = (pessoa, situacao = 'CONFIRMADA', saida = data(75)) => ({
    usuario_id: pessoa._id, convite: 'ACEITO', presenca: {
      entrada: data(0), ...(saida ? { saida } : {}), situacao, marcada_por: 'PROPRIO',
    },
  });
  const inserir = (titulo, participantes, extras = {}) => R.create({ comissao_id: comissao,
    titulo, inicio: data(0), fim: data(120), criada_por: ana._id, participantes, ...extras });
  const normal = await inserir('Confirmada', [participante(ana), participante(outra)]);
  await inserir('Sem saída', [participante(ana, 'CONFIRMADA', null)], { inicio: data(-10) });
  await inserir('Horário inválido antigo', [participante(ana, 'CONFIRMADA', data(-1))], { inicio: data(-20) });
  const legado = participante(ana, 'CONFIRMADA', data(10)); legado.usuario_id = ana.id;
  await inserir('Referência antiga', [legado], { inicio: data(-30) });
  await inserir('Cancelada', [participante(ana)], { situacao: 'CANCELADA' });
  await inserir('Apenas convidada', [{ usuario_id: ana._id, convite: 'ACEITO' }]);
  await inserir('Pendente com outra pessoa confirmada', [participante(ana, 'AGUARDANDO'), participante(outra)]);
  await inserir('Recusada', [participante(ana, 'RECUSADA')]);
  await inserir('Só outra pessoa', [participante(outra)]);
  await inserir('Futura', [participante(ana)], { inicio: new Date(Date.now() + 86400000) });
  const servico = new RelatoriosService(R, U);
  const jwt = new JwtService({ secret: randomUUID() });
  const chave = randomUUID();
  const modulo = await Test.createTestingModule({
    controllers: [RelatoriosController], providers: [
      { provide: RelatoriosService, useValue: servico },
      { provide: JwtService, useValue: jwt }, { provide: getModelToken('Usuario'), useValue: U },
      JwtAuthGuard, UsuarioComumGuard,
    ],
  }).compile();
  app = modulo.createNestApplication();
  app.useGlobalGuards(new ApiKeyGuard(new ConfigService({ API_ACCESS_TOKEN: chave })));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const http = request(app.getHttpServer());
  const token = await jwt.signAsync({ sub: ana.id });
  const get = query => http.get('/relatorios/individual').set('X-API-Key', chave).auth(token, { type: 'bearer' }).query(query || {});
  await http.get('/relatorios/individual').auth(token, { type: 'bearer' }).expect(401);
  await http.get('/relatorios/individual').set('X-API-Key', chave).expect(401);
  await http.get('/relatorios/individual').set('X-API-Key', chave).auth(await jwt.signAsync({ sub: admin.id }), { type: 'bearer' }).expect(403);
  const resultado = await get().expect(200);
  assert.equal(resultado.body.usuario.email, ana.email);
  assert.deepEqual(resultado.body.resumo, { reunioes: 4, minutos_registrados: 85, registros_sem_duracao: 2 });
  assert.deepEqual(resultado.body.reunioes.map(r => r.titulo), ['Confirmada', 'Sem saída', 'Horário inválido antigo', 'Referência antiga']);
  assert.equal(resultado.body.reunioes[0].comissao, 'Comissão de teste');
  assert.equal(resultado.body.reunioes[0].organizacao, 'Organização de teste');
  assert.equal(resultado.body.reunioes[1].saida, null);
  assert.ok(resultado.body.reunioes.every(r => !('participantes' in r) && !('ata' in r)));
  assert.ok(!JSON.stringify(resultado.body).includes(outra.email));
  const filtrado = await get({ de: data(0).toISOString(), ate: data(1).toISOString() }).expect(200);
  assert.deepEqual(filtrado.body.reunioes.map(r => r.reuniao_id), [normal.id]);
  const limite = await get({ ate: data(0).toISOString() }).expect(200);
  assert.equal(limite.body.reunioes.length, 3);
  await get({ de: 'errada' }).expect(400);
  await get({ de: data(1).toISOString(), ate: data(0).toISOString() }).expect(400);
  await get({ de: data(0).toISOString(), ate: data(0).toISOString() }).expect(400);
  const tentativa = await get({ usuario_id: outra.id }).expect(200);
  assert.equal(tentativa.body.usuario.email, ana.email);
  const semRegistros = await http.get('/relatorios/individual').set('X-API-Key', chave).auth(await jwt.signAsync({ sub: vazio.id }), { type: 'bearer' }).expect(200);
  assert.equal(semRegistros.body.resumo.reunioes, 0);
  await C.deleteOne({ _id: comissao });
  const semComissao = await get().expect(200);
  assert.equal(semComissao.body.reunioes[0].comissao, 'Comissão indisponível');
  await U.updateOne({ _id: ana._id }, { ativo: false });
  await get().expect(401);
  console.log('PASSOU: relatório individual com MongoDB/HTTP, autenticação, isolamento por usuário, filtros, histórico e duração.');
} finally {
  await app?.close();
  if (mongoose.connection.name === banco && banco.startsWith('conecta_teste_relatorio_')) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

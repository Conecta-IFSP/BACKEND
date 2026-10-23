import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as os from 'node:os';
import * as bcrypt from 'bcrypt';

import { TipoUsuario, Usuario, type UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import {
  Organizacao,
  PapelOrganizacao,
  StatusMembroOrganizacao,
  StatusOrganizacao,
  type OrganizacaoDocument,
} from '../organizacoes/schemas/organizacao.schema.js';
import { Comissao, PapelComissao, type ComissaoDocument } from '../comissoes/schemas/comissao.schema.js';
import { Reuniao, type ReuniaoDocument } from '../reunioes/schemas/reuniao.schema.js';

@Injectable()
export class SistemaService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<UsuarioDocument>,
    @InjectModel(Organizacao.name) private readonly organizacoes: Model<OrganizacaoDocument>,
    @InjectModel(Comissao.name) private readonly comissoes: Model<ComissaoDocument>,
    @InjectModel(Reuniao.name) private readonly reunioes: Model<ReuniaoDocument>,
  ) {}

  async status() {
    const memoriaTotal = os.totalmem();
    const memoriaLivre = os.freemem();
    const [carga1min] = os.loadavg();

    const [usuariosTotal, organizacoesTotal, comissoesTotal] = await Promise.all([
      this.usuarios.countDocuments().exec(),
      this.organizacoes.countDocuments().exec(),
      this.comissoes.countDocuments().exec(),
    ]);

    return {
      servidor: {
        memoria: {
          total_mb: Math.round(memoriaTotal / 1024 / 1024),
          livre_mb: Math.round(memoriaLivre / 1024 / 1024),
          uso_percentual: Math.round(((memoriaTotal - memoriaLivre) / memoriaTotal) * 100),
        },
        cpu: {
          nucleos: os.cpus().length,
          carga_media_1min: Number(carga1min.toFixed(2)),
        },
        tempo_ativo_segundos: Math.round(os.uptime()),
      },
      banco_de_dados: {
        conectado: true,
        colecoes: {
          usuarios: usuariosTotal,
          organizacoes: organizacoesTotal,
          comissoes: comissoesTotal,
        },
      },
      verificado_em: new Date(),
    };
  }

  async relatorios() {
    const [usuariosTotal, usuariosAtivos, orgTotal, orgPendentes, orgAprovadas, comissoesTotal, comissoesAtivas] =
      await Promise.all([
        this.usuarios.countDocuments().exec(),
        this.usuarios.countDocuments({ ativo: true }).exec(),
        this.organizacoes.countDocuments().exec(),
        this.organizacoes.countDocuments({ status: StatusOrganizacao.PENDENTE }).exec(),
        this.organizacoes.countDocuments({ status: StatusOrganizacao.APROVADA }).exec(),
        this.comissoes.countDocuments().exec(),
        this.comissoes.countDocuments({ ativo: true }).exec(),
      ]);

    return {
      usuarios: { total: usuariosTotal, ativos: usuariosAtivos },
      organizacoes: { total: orgTotal, pendentes: orgPendentes, aprovadas: orgAprovadas },
      comissoes: { total: comissoesTotal, ativas: comissoesAtivas },
    };
  }

  async reset() {
    await Promise.all([
      this.usuarios.deleteMany({ tipo: { $ne: TipoUsuario.ADMIN_SISTEMA } }).exec(),
      this.organizacoes.deleteMany({}).exec(),
      this.comissoes.deleteMany({}).exec(),
      this.reunioes.deleteMany({}).exec(),
    ]);

    return { status: 'sistema_resetado', resetado_em: new Date() };
  }

  async popularDadosDeTeste() {
    const configuracao = this.obterConfiguracaoUsuariosTeste();
    const senhaHash = await bcrypt.hash(configuracao.senha, 10);

    const [semVinculo, membroOrganizacao, membroComissao] = await Promise.all([
      this.usuarios.create({
        nome: configuracao.semVinculo.nome,
        email: configuracao.semVinculo.email,
        senha_hash: senhaHash,
      }),
      this.usuarios.create({
        nome: configuracao.organizacao.nome,
        email: configuracao.organizacao.email,
        senha_hash: senhaHash,
      }),
      this.usuarios.create({
        nome: configuracao.comissao.nome,
        email: configuracao.comissao.email,
        senha_hash: senhaHash,
      }),
    ]);

    const organizacao = await this.organizacoes.create({
      nome: 'Organização de Teste',
      cidade: 'São Paulo',
      descricao: 'Criada para testes.',
      criada_por: membroOrganizacao._id,
      status: StatusOrganizacao.APROVADA,
      membros: [
        {
          usuario_id: membroOrganizacao._id,
          papel: PapelOrganizacao.ADMIN,
          status: StatusMembroOrganizacao.APROVADO,
          solicitado_em: new Date(),
          aprovado_em: new Date(),
        },
        {
          usuario_id: membroComissao._id,
          papel: PapelOrganizacao.MEMBRO,
          status: StatusMembroOrganizacao.APROVADO,
          solicitado_em: new Date(),
          aprovado_em: new Date(),
        },
      ],
    });

    await this.comissoes.create({
      nome: 'Comissão de Teste',
      descricao: 'Criada para testes.',
      organizacao_id: organizacao._id,
      membros: [
        {
          usuario_id: membroComissao._id,
          papel: PapelComissao.RESPONSAVEL,
          adicionado_em: new Date(),
        },
      ],
    });

    return {
      status: 'dados_de_teste_criados',
      usuarios: [
        { nome: semVinculo.nome, email: semVinculo.email, cenario: 'sem vínculo' },
        { nome: membroOrganizacao.nome, email: membroOrganizacao.email, cenario: 'admin de organização' },
        { nome: membroComissao.nome, email: membroComissao.email, cenario: 'membro de organização e comissão' },
      ],
    };
  }

  private obterConfiguracaoUsuariosTeste() {
    const valor = (chave: string) => process.env[chave]?.trim();
    const configuracao = {
      senha: process.env.TEST_USERS_PASSWORD,
      semVinculo: { nome: valor('TEST_USER_NO_ORG_NAME'), email: valor('TEST_USER_NO_ORG_EMAIL')?.toLowerCase() },
      organizacao: { nome: valor('TEST_USER_ORG_NAME'), email: valor('TEST_USER_ORG_EMAIL')?.toLowerCase() },
      comissao: { nome: valor('TEST_USER_COMMISSION_NAME'), email: valor('TEST_USER_COMMISSION_EMAIL')?.toLowerCase() },
    };

    const ausentes = [
      ['TEST_USERS_PASSWORD', configuracao.senha],
      ['TEST_USER_NO_ORG_NAME', configuracao.semVinculo.nome],
      ['TEST_USER_NO_ORG_EMAIL', configuracao.semVinculo.email],
      ['TEST_USER_ORG_NAME', configuracao.organizacao.nome],
      ['TEST_USER_ORG_EMAIL', configuracao.organizacao.email],
      ['TEST_USER_COMMISSION_NAME', configuracao.comissao.nome],
      ['TEST_USER_COMMISSION_EMAIL', configuracao.comissao.email],
    ].filter(([, conteudo]) => !conteudo).map(([chave]) => chave);

    if (ausentes.length > 0) {
      throw new BadRequestException(`Configure as contas de teste no .env: ${ausentes.join(', ')}`);
    }

    return configuracao as {
      senha: string;
      semVinculo: { nome: string; email: string };
      organizacao: { nome: string; email: string };
      comissao: { nome: string; email: string };
    };
  }
}

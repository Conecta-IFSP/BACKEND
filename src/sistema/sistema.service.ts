import { Injectable } from '@nestjs/common';
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

const SENHA_USUARIO_TESTE = 'Teste@123';

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
    const senhaHash = await bcrypt.hash(SENHA_USUARIO_TESTE, 10);

    const [semVinculo, membroOrganizacao, membroComissao] = await Promise.all([
      this.usuarios.create({
        nome: 'Usuário Teste Sem Vínculo',
        email: 'teste.semvinculo@conectamais.com',
        senha_hash: senhaHash,
      }),
      this.usuarios.create({
        nome: 'Usuário Teste Organização',
        email: 'teste.organizacao@conectamais.com',
        senha_hash: senhaHash,
      }),
      this.usuarios.create({
        nome: 'Usuário Teste Comissão',
        email: 'teste.comissao@conectamais.com',
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
      senha_padrao: SENHA_USUARIO_TESTE,
      usuarios: [
        { nome: semVinculo.nome, email: semVinculo.email, cenario: 'sem vínculo' },
        { nome: membroOrganizacao.nome, email: membroOrganizacao.email, cenario: 'admin de organização' },
        { nome: membroComissao.nome, email: membroComissao.email, cenario: 'membro de organização e comissão' },
      ],
    };
  }
}

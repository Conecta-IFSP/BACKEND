import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { Reuniao, ReuniaoDocument, OrigemPresenca, SituacaoPresenca } from '../reunioes/schemas/reuniao.schema.js';
import { Comissao, ComissaoDocument } from '../comissoes/schemas/comissao.schema.js';
import { Organizacao, OrganizacaoDocument } from '../organizacoes/schemas/organizacao.schema.js';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import { NotificacoesService } from '../notificacoes/notificacoes.service.js';
import type { CorrigirHorarioDto, EnviarAcessoDto, RegistrarAcessoDto } from './presencas.dto.js';

@Injectable()
export class PresencasService {
  constructor(
    @InjectModel(Reuniao.name) private readonly reunioes: Model<ReuniaoDocument>,
    @InjectModel(Comissao.name) private readonly comissoes: Model<ComissaoDocument>,
    @InjectModel(Organizacao.name) private readonly organizacoes: Model<OrganizacaoDocument>,
    @InjectModel(Usuario.name) private readonly usuarios: Model<UsuarioDocument>,
    private readonly notificacoes: NotificacoesService,
    private readonly config: ConfigService,
  ) {}

  private hash(codigo: string) { return createHash('sha256').update(codigo).digest('hex'); }
  private async carregar(id: string, usuarioId: string, presidente = false) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Reunião não encontrada');
    const r = await this.reunioes.findById(id).select('+acesso_presenca').exec();
    if (!r) throw new NotFoundException('Reunião não encontrada');
    const c = await this.comissoes.findById(r.comissao_id).exec();
    const membro = c?.membros.find(m => m.usuario_id.toString() === usuarioId);
    if (!c || !c.ativo || !membro || (presidente && membro.papel !== 'RESPONSAVEL')) throw new ForbiddenException('Acesso restrito ao responsável ou convidado da comissão');
    const o = await this.organizacoes.findById(c.organizacao_id).exec();
    if (o?.status !== 'APROVADA' || !o.membros.some(m => m.usuario_id.toString() === usuarioId && m.status === 'APROVADO')) throw new ForbiddenException('Sem acesso a esta organização');
    const participante = r.participantes.find(p => p.usuario_id.toString() === usuarioId);
    if (!presidente && !participante) throw new ForbiddenException('Você não foi convidado para esta reunião');
    return { r, c, participante };
  }
  private editavel(r: ReuniaoDocument) {
    if (r.situacao !== 'AGENDADA') throw new BadRequestException('Esta reunião foi cancelada');
    if (r.ata && r.ata.situacao !== 'RASCUNHO') throw new BadRequestException('A ata já foi enviada. Os registros de presença estão fechados.');
  }
  private filtro(r: ReuniaoDocument): Record<string, unknown> {
    return { _id: r._id, situacao: 'AGENDADA' as const, inicio: r.inicio, fim: r.fim,
      ata: r.ata ?? { $exists: false as const } };
  }
  private validarLink(r: ReuniaoDocument, c: ComissaoDocument, codigo: string) {
    const acesso = r.acesso_presenca;
    const presidente = c.membros.find(m => m.papel === 'RESPONSAVEL')?.usuario_id.toString();
    if (!acesso || acesso.hash !== this.hash(codigo) || acesso.responsavel_id !== presidente ||
      new Date(acesso.inicio).getTime() !== r.inicio.getTime() || new Date(acesso.fim).getTime() !== r.fim.getTime() || new Date() >= r.fim) {
      throw new BadRequestException('Link inválido, revogado ou expirado. Solicite um novo ao responsável.');
    }
    this.editavel(r);
  }
  private url(id: string, codigo: string) {
    const base = this.config.get<string>('FRONTEND_URL');
    if (!base || !/^https?:\/\//.test(base)) throw new ServiceUnavailableException('Configure FRONTEND_URL para gerar o link');
    return `${base.replace(/\/$/, '')}/presenca?id=${id}&codigo=${codigo}`;
  }
  async gestao(id: string, usuarioId: string) {
    const { r } = await this.carregar(id, usuarioId, true);
    const acesso = r.acesso_presenca;
    const linkAtivo = Boolean(acesso && acesso.responsavel_id === usuarioId &&
      new Date(acesso.inicio).getTime() === r.inicio.getTime() && new Date(acesso.fim).getTime() === r.fim.getTime() &&
      new Date() < r.fim && r.situacao === 'AGENDADA' && (!r.ata || r.ata.situacao === 'RASCUNHO'));
    return { autorizado: true, link_ativo: linkAtivo,
      inicio: r.inicio, fim: r.fim, participantes: r.participantes, revisao: r.presencas_revisao ?? 0 };
  }
  async gerar(id: string, usuarioId: string) {
    const { r } = await this.carregar(id, usuarioId, true);
    this.editavel(r);
    if (new Date() >= r.fim) throw new BadRequestException('Esta reunião já terminou');
    const codigo = randomBytes(32).toString('hex');
    const url = this.url(id, codigo);
    const atualizado = await this.reunioes.findOneAndUpdate(this.filtro(r), { $set: {
      acesso_presenca: { hash: this.hash(codigo), inicio: r.inicio, fim: r.fim, responsavel_id: usuarioId, criado_em: new Date() },
    } }, { returnDocument: 'after' }).exec();
    if (!atualizado) throw new ConflictException('A reunião mudou. Atualize a tela.');
    await this.notificacoes.invalidarPresenca(id);
    return { codigo, url, valido_de: r.inicio, expira_em: r.fim };
  }
  async revogar(id: string, usuarioId: string) {
    await this.carregar(id, usuarioId, true);
    await this.reunioes.updateOne({ _id: id }, { $unset: { acesso_presenca: 1 } }).exec();
    await this.notificacoes.invalidarPresenca(id);
    return { mensagem: 'Link revogado' };
  }
  async consultar(id: string, codigo: string, usuarioId: string) {
    const { r, c, participante } = await this.carregar(id, usuarioId);
    this.validarLink(r, c, codigo);
    return { titulo: r.titulo, comissao: c.nome, inicio: r.inicio, fim: r.fim,
      convite: participante!.convite, presenca: participante!.presenca ?? null };
  }
  async registrar(id: string, dto: RegistrarAcessoDto, usuarioId: string) {
    const { r, c, participante } = await this.carregar(id, usuarioId);
    this.validarLink(r, c, dto.codigo);
    const agora = new Date();
    if (agora < r.inicio) throw new BadRequestException('A reunião ainda não começou');
    if (participante!.convite !== 'ACEITO') throw new BadRequestException('Aceite o convite na reunião antes de registrar presença');
    const presenca = participante!.presenca;
    if (dto.acao === 'ENTRADA' && presenca) throw new ConflictException('Sua entrada já foi registrada. Para corrigir, procure o responsável.');
    if (dto.acao === 'SAIDA' && (!presenca || presenca.situacao !== 'CONFIRMADA')) throw new BadRequestException('É necessário ter uma entrada confirmada');
    if (dto.acao === 'SAIDA' && presenca?.saida) throw new ConflictException('Sua saída já foi registrada');
    const alvo = { usuario_id: participante!.usuario_id, convite: 'ACEITO',
      ...(dto.acao === 'ENTRADA' ? { presenca: { $exists: false } } : {
        'presenca.entrada': presenca!.entrada, 'presenca.situacao': 'CONFIRMADA', 'presenca.saida': { $exists: false },
      }) };
    const alteracao = dto.acao === 'ENTRADA' ? {
      'participantes.$.presenca': { entrada: agora, situacao: SituacaoPresenca.CONFIRMADA, marcada_por: OrigemPresenca.LINK },
    } : { 'participantes.$.presenca.saida': agora };
    const atualizado = await this.reunioes.findOneAndUpdate({ ...this.filtro(r),
      'acesso_presenca.hash': this.hash(dto.codigo), fim: r.fim, inicio: r.inicio,
      $expr: { $and: [{ $lte: ['$inicio', '$$NOW'] }, { $gt: ['$fim', '$$NOW'] }] },
      participantes: { $elemMatch: alvo },
    }, { $set: alteracao, $inc: { presencas_revisao: 1 } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!atualizado) throw new ConflictException('Registro alterado ou link revogado. Atualize a tela.');
    return { mensagem: dto.acao === 'ENTRADA' ? 'Entrada confirmada automaticamente' : 'Saída registrada' };
  }
  async enviar(id: string, dto: EnviarAcessoDto, usuarioId: string) {
    const { r, c } = await this.carregar(id, usuarioId, true);
    this.validarLink(r, c, dto.codigo);
    const url = this.url(id, dto.codigo);
    const ids = r.participantes.filter(p => p.usuario_id.toString() !== usuarioId && p.convite !== 'RECUSADO').map(p => p.usuario_id);
    const convidados = await this.usuarios.find({ _id: { $in: ids }, ativo: true }).select('email').exec();
    if (dto.canal === 'APP') {
      for (const p of convidados) await this.notificacoes.criar(p._id.toString(), {
        chave: `PRESENCA:${id}:${this.hash(dto.codigo)}`, tipo: 'PRESENCA', titulo: r.titulo,
        mensagem: 'O responsável solicitou seu registro de presença. Abra para confirmar durante a reunião.',
        destino: `/presenca?id=${id}&codigo=${dto.codigo}`, expira_em: r.fim,
      });
      return { mensagem: `Notificação disponibilizada para ${convidados.length} convidado(s).` };
    }
    const host = this.config.get<string>('MAIL_HOST');
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASS');
    if (!host || !user || !pass) throw new ServiceUnavailableException('Envio de e-mail não configurado neste ambiente. Use a notificação no aplicativo ou copie o link.');
    const port = Number(this.config.get('MAIL_PORT') ?? 587);
    const smtp = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
    let enviados = 0;
    for (const p of convidados) {
      try {
        await smtp.sendMail({ from: this.config.get<string>('MAIL_FROM') || user, to: p.email,
          subject: 'Conecta+ — solicitação de presença',
          text: `Reunião: ${r.titulo}\nComissão: ${c.nome}\nAbra o link e entre com sua conta de convidado para confirmar sua presença durante a reunião:\n${url}\nAbrir o endereço não registra presença automaticamente.`,
        });
        enviados++;
      } catch { /* Informa a quantidade real; não expõe endereços nem detalhes SMTP. */ }
    }
    return { mensagem: `${enviados} e-mail(s) enviado(s); ${convidados.length - enviados} falha(s).` };
  }
  async corrigir(id: string, alvoId: string, dto: CorrigirHorarioDto, usuarioId: string) {
    const { r } = await this.carregar(id, usuarioId, true);
    this.editavel(r);
    const alvo = r.participantes.find(p => p.usuario_id.toString() === alvoId);
    if (dto.revisao !== (r.presencas_revisao ?? 0)) throw new ConflictException('Os registros mudaram. Atualize a tela antes de corrigir.');
    if (!alvo) throw new NotFoundException('Participante não encontrado');
    const entrada = new Date(dto.entrada), saida = dto.saida ? new Date(dto.saida) : undefined, agora = new Date();
    if (!Number.isFinite(entrada.getTime()) || entrada < r.inicio || entrada > r.fim || entrada > agora ||
      (saida && (!Number.isFinite(saida.getTime()) || saida < entrada || saida > r.fim || saida > agora))) {
      throw new BadRequestException('Informe horários já ocorridos dentro da reunião, com saída após a entrada');
    }
    const antes = alvo.presenca;
    const depois = { entrada, ...(saida ? { saida } : {}), situacao: SituacaoPresenca.CONFIRMADA, marcada_por: OrigemPresenca.RESPONSAVEL };
    const filtroAlvo = { usuario_id: alvo.usuario_id, ...(antes ? {
      'presenca.entrada': antes.entrada, 'presenca.saida': antes.saida ?? { $exists: false },
      'presenca.situacao': antes.situacao, 'presenca.marcada_por': antes.marcada_por,
    } : { presenca: { $exists: false } }) };
    const atualizado = await this.reunioes.findOneAndUpdate({ ...this.filtro(r),
      ...((r.presencas_revisao ?? 0) === 0 ? { $or: [{ presencas_revisao: 0 }, { presencas_revisao: { $exists: false } }] } : { presencas_revisao: r.presencas_revisao }),
      participantes: { $elemMatch: filtroAlvo } }, {
      $set: { 'participantes.$.presenca': depois },
      $inc: { presencas_revisao: 1 },
      $push: { historico_presencas: { participante_id: alvoId, responsavel_id: usuarioId, alterada_em: agora,
        motivo: dto.motivo, antes: antes ? { entrada: antes.entrada, saida: antes.saida, situacao: antes.situacao, marcada_por: antes.marcada_por } : null, depois } },
    }, { returnDocument: 'after', runValidators: true }).exec();
    if (!atualizado) throw new ConflictException('A presença mudou. Atualize antes de corrigir.');
    return { mensagem: 'Horários corrigidos; motivo e valores anteriores guardados no histórico.' };
  }
  async historico(id: string, usuarioId: string) {
    await this.carregar(id, usuarioId, true);
    const r = await this.reunioes.findById(id).select('+historico_presencas').exec();
    return r?.historico_presencas ?? [];
  }
}
